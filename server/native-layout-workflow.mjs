import {modelApiKey} from './model-connections.mjs';
import {randomUUID} from 'node:crypto';
import {runHermes} from './hermes-client.mjs';
import {runPageAgents} from './page-agent-pool.mjs';
import {requestSchema,deckSchema,normalizeModelPlan} from './planner.mjs';
import {saveWorkflowCheckpoint,loadWorkflowCheckpoint} from './workflow-checkpoints.mjs';
import {sourceBuffer} from './library.mjs';
import {nativePlanningPages,TEMPLATE_CONTRACT_VERSION} from './template-slot-contract.mjs';
import {validateNativeBindings,validateNativeChartData,nativeReferencePalette,inspectNativeReference} from './native-layout-reference.mjs';

const rule=`你通过Hermes使用DeepSeek制作原生可编辑PPT。用户文档是唯一事实来源；参考PPT中的示例数据、单位名称、日期、结果只描述版式，禁止当作事实。先理解全页结构与每个文本槽的职责，再撰写相互关联的主题、标题与正文。保留所有源对象位置、颜色、字号，不添加左侧说明栏，不缩小主体。所有可替换槽必须提交，缺事实明确待补充；数字统计与结论必须有用户文档依据。页码、章节编号、箭头符号和固定感谢标题由系统保留，不要提交固定槽。正文精简但有具体含义，主题不相关时重新组织，不用空泛占位语。未提供Logo不伪造。`;
const object={type:'object',additionalProperties:false};
const planningTool={name:'ppt_submit_native_plan',description:'提交完整逐页内容与参考版式选择',parameters:{...object,properties:{title:{type:'string'},slides:{type:'array',items:{...object,properties:{title:{type:'string'},kind:{type:'string',enum:['cover','agenda','content','process','ending']},templatePage:{type:'integer'},bullets:{type:'array',items:{type:'string'}},notes:{type:'string'}},required:['title','kind','templatePage','bullets','notes']}}},required:['title','slides']}};
const writingTool={name:'ppt_fill_native_page',description:'填充本页全部原生文字及图表数据，保留参考结构',parameters:{...object,properties:{bindings:{type:'array',items:{...object,properties:{key:{type:'string'},text:{type:'string'}},required:['key','text']}},charts:{type:'array',items:{...object,properties:{index:{type:'integer'},title:{type:'string'},unit:{type:'string'},isSimulated:{type:'boolean'},records:{type:'array',items:{...object,properties:{x:{type:'string'},series:{type:'string'},value:{type:'number'},sourceQuote:{type:'string'}},required:['x','series','value','sourceQuote']}}},required:['index','title','unit','records']}}},required:['bindings','charts']}};

export async function runNativeLayoutWorkflow(body,{onPhase=()=>{},onPlan=()=>{},onProgress=()=>{},checkpointId=randomUUID(),resumeCheckpoint,runAgent=runHermes,saveOutput}={}){
 const restored=resumeCheckpoint||await loadWorkflowCheckpoint(checkpointId),input=requestSchema.parse({...restored?.body,...body});let ref=input.styleSkillSnapshot.nativeTemplate;
 if(!ref?.pages?.length||!ref.templateId)throw Error('版式缺少原生参考PPT，请重新绑定');
 if(ref.contractVersion!==TEMPLATE_CONTRACT_VERSION){const original=ref,latest=await inspectNativeReference(await sourceBuffer(ref.sourceId),ref.name);ref={...original,...latest,pages:latest.pages.map(p=>{const old=original.pages.find(o=>o.page===p.page);return {...p,analysis:old?.analysis,slots:p.slots.map(s=>({...old?.slots.find(o=>o.key===s.key),...s}))};})};input.styleSkillSnapshot={...input.styleSkillSnapshot,nativeTemplate:ref};}
 const reusable=input.styleSkillSnapshot.templateUsage==='layout'||(!input.styleSkillSnapshot.templateUsage&&ref.templateKind==='layout-library');
 const key=input.apiKey||modelApiKey();if(!key)throw Error('请先配置DeepSeek API Key');
 const institution=input.institutionName||input.document.match(/(?:机构|学校名称|所属单位)\s*[:：]\s*([^\n；;，,。]{1,50})/)?.[1]?.trim()||'';
 const fixedText=(slot,page)=>slot.role==='page-number'?`${String(page).padStart(2,'0')} / ${count}`:slot.role==='institution'?institution||'机构名称待补充':slot.text;
 const count=input.pageCount||input.styleSkillSnapshot.defaultPageCount||(reusable?Math.max(4,Math.min(30,Math.ceil(input.document.length/360)+3)):Math.min(30,ref.pages.length));if(!reusable&&count>ref.pages.length)throw Error(`完整参考稿有${ref.pages.length}个不同页面；可选择底稿模板模式复用正文版式，或补充参考页`);const hasAgenda=ref.pages.some(p=>p.kind==='agenda'),hasEnding=ref.pages.some(p=>p.kind==='ending');
 let plan=restored?.plan||input.outlinePlan,stage='planning',phase='Hermes：分析文档与原生参考版式',metrics=[...(restored?.metrics||[])],errors=[],runs=[...(restored?.runs||[])],chain=Promise.resolve();
 const progress=()=>({stage,totalPages:plan?.slides?.length||count,completedPages:plan?.slides?.flatMap((s,i)=>s.adaptation?.status==='checked'?[i+1]:[])||[],activePages:[],failedPages:errors,concurrency:4,batchSize:1,modelRequests:metrics.reduce((n,m)=>n+(m.modelRequests||0),0),resumable:stage!=='done'});
 const persist=async(status='running',extra={})=>{const snapshot=structuredClone({id:checkpointId,body:input,plan,status,phase,progress:progress(),resumable:status==='failed',metrics,runs,...extra});chain=chain.then(()=>saveWorkflowCheckpoint(checkpointId,snapshot));await chain;onProgress(progress());};
 const agent=async args=>{const run={runId:args.id,role:args.role,pages:args.assignedPages,status:'running',startedAt:new Date().toISOString()};runs.push(run);await persist();try{const r=await runAgent({...args,apiKey:key,model:input.model,allowSkillTool:false,maxIterations:3,timeoutMs:300000,onMetrics:m=>metrics.push(m)});run.status='finished';return r;}catch(e){run.status='failed';throw e;}finally{run.finishedAt=new Date().toISOString();await persist();}};
 try{
  onPhase(phase);
  if(!plan){
   await agent({id:randomUUID(),role:'native-layout-planner',maxTokens:14000,systemPrompt:rule+'\n'+input.styleSkillSnapshot.content,message:JSON.stringify({任务:{document:input.document,title:input.title,audience:input.audience,requirements:input.requirements,institution:input.institutionName,pageCount:count},模板用途:reusable?'可复用正文版式的底稿模板':'整套参考稿，每个参考页最多一次',参考页:nativePlanningPages(ref),约束:'遵循任务指定页数，不默认12页，不把某一页固定当作说明页。首页使用封面；模板有目录/结束页时使用对应页型，否则从正文版式组织目录、从封面组织结尾。底稿模式允许复用正文容器，完整参考稿模式不能重复参考页。先匹配模块关系与每个槽的容量，再组织内容；字多时按逻辑拆页，不把多个独立观点硬塞进一个短标签。模板示例事实不得带入。'}),tools:[planningTool],onTool:async(name,args)=>{
    if(name!==planningTool.name)throw Error('只允许提交逐页方案');const parsed=deckSchema.parse(normalizeModelPlan(args));
    if(parsed.slides.length!==count)throw Error(`总页数应为${count}`);const seen=new Set();
    for(const [i,s]of parsed.slides.entries()){const p=ref.pages[s.templatePage-1];if(!p||!reusable&&seen.has(p.page))throw Error('参考页不存在或完整参考稿重复使用同页');seen.add(p.page);if(i===0&&p.kind!=='cover'||i===count-1&&hasEnding&&p.kind!=='ending'||i===1&&hasAgenda&&p.kind!=='agenda')throw Error('首页、目录及结束页须匹配模板已有页型');}
    plan=parsed;await persist();return {ok:true,pages:plan.slides.length};},completeWhen:(name,r)=>name===planningTool.name&&r.ok});
   if(!plan)throw Error('Hermes未提交有效逐页方案');
  }
  // Re-pin trusted native references after outline editing or resume. Never use
  // client-supplied material snapshots or a stale global active template.
  plan={...plan,title:plan.title||input.title,workflow:'hermes-native-layout',palette:nativeReferencePalette(ref),institutionName:institution,designProfile:'material',templateId:ref.templateId,styleSkillSnapshot:input.styleSkillSnapshot,sourceText:input.document,sourceName:input.sourceName,sourceProvenance:input.sourceProvenance,designWarnings:[],slides:plan.slides.map((s,i)=>{
   const p=ref.pages[s.templatePage-1];if(!p)throw Error('逐页方案引用的版式已失效');
   const fixedBindings=(s.materialBindings||[]).map(b=>{const slot=p.slots.find(v=>v.key===b.key);return slot?.fixed?{...b,text:fixedText(slot,i+1)}:b;});
   return {...s,materialBindings:fixedBindings,blocks:[{id:`native-page-${i+1}`,type:'shape',x:0,y:0,w:0,h:0}],materialId:`${ref.sourceId}-${p.page}-native`,materialSnapshot:{id:`${ref.sourceId}-${p.page}-native`,sourceId:ref.sourceId,sourceName:ref.name,part:p.part,page:p.page,sourceFullPage:true,nativeReference:true,templateReusable:reusable,contractVersion:TEMPLATE_CONTRACT_VERSION,slots:p.slots,chartData:s.materialSnapshot?.sourceId===ref.sourceId&&s.materialSnapshot?.page===p.page?s.materialSnapshot.chartData:undefined},layoutReview:{recipe:'full-source-page',sourceObjects:p.objects,retainedObjects:p.objects,materialUsage:{area:1,width:1,height:1}},notes:s.notes||''};})};
  if(plan.slides.length!==count||!reusable&&new Set(plan.slides.map(s=>s.templatePage)).size!==count)throw Error('逐页方案页数不符或参考版式重复，请重新规划');
  for(const s of plan.slides)if(s.adaptation?.status==='checked'){try{validateNativeBindings(ref.pages[s.templatePage-1],(s.materialBindings||[]).filter(b=>!ref.pages[s.templatePage-1].slots.find(slot=>slot.key===b.key)?.fixed));validateNativeChartData(ref.pages[s.templatePage-1],s.materialSnapshot.chartData||[],input.document);}catch{s.adaptation=undefined;}}
  onPlan(plan);await persist();
  if(input.planningOnly){const output={planningOnly:true,title:plan.title,pages:count,plan};stage='done';await persist('done',{output});return output;}
  stage='writing';phase='Hermes：按原生槽位容量并行撰写每页';onPhase(phase);
  async function write(page,issues){
   const slide=plan.slides[page-1],p=ref.pages[slide.templatePage-1];let accepted=false;
   await agent({id:randomUUID(),role:'native-layout-page-'+page,assignedPages:[page],maxTokens:12000,systemPrompt:rule+'\n'+input.styleSkillSnapshot.content,message:JSON.stringify({page,total:count,outline:{title:slide.title,bullets:slide.bullets,notes:slide.notes},allPageTitles:plan.slides.map(s=>s.title),document:input.document,requirements:input.requirements,modules:p.analysis?.modules,layout:p.analysis?.layoutDescription,templateContractVersion:TEMPLATE_CONTRACT_VERSION,slots:p.slots.filter(s=>!s.fixed),charts:p.charts,previousBindings:issues?slide.materialBindings:undefined,measuredOverflow:issues,instruction:'所有非固定槽按原角色完整替换；每个模块标题、图名、单位、说明必须关联本页主题，不相关的模板示例短语也要改掉，不能只换长段落，maxChars是字符数上界；还须按capacity.maxUnits核对中英文占宽和maxLines换行。中文约1单位，英文/数字约0.55单位。正文先写对应模块标题，再填说明；空白占位符也有真实容量，需要按用途填写。没有事实且属于可选元信息可提交空串；不能把长句塞进短标签，也不能为了填空复制无关主题。表格每格也是独立槽。目录不可重复、不可保留本章内容。数字图表只提交原文可核验数据，没有数据或原文缺单位时提交records:[]，unit不准编造；模拟数据显式isSimulated:true；引用图表的标题与结论同步改为待补数据或不依赖数值的真实说明。模板默认实验值绝不能带入。'}),tools:[writingTool],onTool:async(name,args)=>{
    if(name!==writingTool.name)throw Error('只允许填写本页');validateNativeBindings(p,args.bindings);validateNativeChartData(p,args.charts,input.document);
    slide.materialBindings=p.slots.map(slot=>({slot:slot.index,key:slot.key,text:slot.fixed?fixedText(slot,page):args.bindings.find(b=>b.key===slot.key).text}));
    slide.materialSnapshot.chartData=args.charts.map(d=>({...d,is_simulated:d.records.length>0&&(Boolean(d.isSimulated)||d.records.some(r=>/模拟|仅示意/.test(r.sourceQuote))||/所有数字仅用于验收|所有.*数值.*模拟/.test(input.document))}));slide.adaptation={status:'checked'};accepted=true;await persist();return {ok:true,pages:[{page,ok:true}]};},completeWhen:(name,r)=>name===writingTool.name&&r.ok});
   if(!accepted)throw Error(`第${page}页未提交完整原生槽位`);
  }
  await runPageAgents(plan.slides.map((_,i)=>i+1),{concurrency:4,isComplete:n=>plan.slides[n-1].adaptation?.status==='checked',worker:async n=>{try{return await write(n);}catch(e){errors.push({page:n,error:e.message});await persist();throw e;}},onProgress:p=>onProgress({...progress(),activePages:p.activePages||[],workers:p.workers||[]})});
  const missing=plan.slides.flatMap((s,i)=>s.adaptation?.status==='checked'?[]:[i+1]);if(missing.length)throw Error('以下页面尚未完成：'+missing.join('、'));
  stage='publishing';phase='检查原生文字、关系与全页预览';onPhase(phase);await persist();
  const save=saveOutput||(await import('./studio.mjs')).saveComposition;let output;
  for(let attempt=0;attempt<3;attempt++){
   try{output=await save(plan,{onPhase,requireNativeCheck:true});break;}catch(e){if(attempt===2||!e.issues?.length)throw e;const pages=[...new Set(e.issues.map(v=>v.page))];onPhase('依据PowerPoint实测边界精简文案：'+pages.join('、'));await runPageAgents(pages,{concurrency:4,worker:n=>write(n,e.issues.filter(v=>v.page===n))});}
  }
  stage='done';phase='原生PPT与全页预览已就绪';output={...output,execution:{mode:'native-reference',checkpointId,metrics}};await persist('done',{output});return output;
 }catch(e){stage='failed';phase=e.message;if(!errors.length)errors=[{page:0,error:e.message}];await persist('failed',{error:e.message});e.checkpointId=checkpointId;e.resumable=true;e.progress=progress();throw e;}
}
