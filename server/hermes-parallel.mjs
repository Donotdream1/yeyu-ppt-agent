import {generatePageTemplate} from './page-template-fallback.mjs';
import {modelApiKey} from './model-connections.mjs';
import {navigationPolicy} from './navigation-sections.mjs';
import {createPresentationContract} from './presentation-contract.mjs';
import fs from 'node:fs/promises';
import {throwIfTaskStopped,isTaskStopped} from './task-control.mjs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createHermesSession,HERMES_TOOLS} from './hermes-workflow.mjs';
import {runHermes} from './hermes-client.mjs';
import {contentUnits,validateAdaptation} from './designer.mjs';
import {researchPageErrors} from './research-profile.mjs';
import {analyzeMaterial} from './material-analysis.mjs';
import {composeHermesSlide} from './page-layout.mjs';
import {prepareVisualCandidates,selectVisualPages} from './visual-selection.mjs';
import {saveWorkflowCheckpoint,loadWorkflowCheckpoint} from './workflow-checkpoints.mjs';
import {dataDir} from './library.mjs';
import {atomicUpdateJson} from './atomic-json.mjs';
import {slideTagRequirements} from './material-tags.mjs';
import {recordMaterialUses} from './material-tag-store.mjs';
import {materialIdentity,agendaItemCount} from './material-semantics.mjs';
import {preparePageEvidence} from './page-evidence.mjs';
import {runPageAgents,pageScopedTools} from './page-agent-pool.mjs';
export {pageEvidence} from './page-evidence.mjs';
import {SHARED_CONTRACT,PLANNER_CONTRACT,WRITER_CONTRACT,RESEARCH_WRITER_CONTRACT,CHART_COPY_CONTRACT,STORYBOARD_TOOL,storyboardTool,writerPageContext,executionSummary} from './workflow-prompts.mjs';

const clamp=(v,f,min,max)=>Math.max(min,Math.min(max,Number.isFinite(+v)?Math.trunc(+v):f));
export const executionOptions=body=>({concurrency:clamp(body.concurrency??process.env.HERMES_CONCURRENCY,4,1,6),batchSize:1,pageAgentMode:'one-page-per-agent',visualBatchSize:clamp(body.visualBatchSize??process.env.HERMES_VISUAL_BATCH_SIZE,4,1,4)});
const toolsFor=names=>HERMES_TOOLS.filter(t=>names.includes(t.name));
const rules=SHARED_CONTRACT;
async function roleSkills(session,names,{research=false}={}){
 const parts=[];
 for(const name of names){
  const root=path.resolve('agents/skills',name),files=['SKILL.md'];
  if(name==='ppt-writing')files.push('references/user-rules.md','references/design-quality.md',...(research?['references/research-defense.md']:[]));
  if(name==='chart-drawing')files.push('references/user-rules.md');
  if(name==='harness-review')files.push('references/adoption.md');
  for(const file of files){if(file==='references/design-quality.md'&&parts.some(v=>v.includes('<!-- design-quality:v1 -->')))continue;const custom=file==='references/user-rules.md'?(name==='ppt-writing'?session.input.presentationPrompt:name==='chart-drawing'?session.input.chartPrompt:null):null,content=custom||await fs.readFile(path.join(root,file),'utf8');parts.push(`技能 ${name}/${file}\n${content}`);await session.handle('skill_loaded',{name,file_path:file,source:'coordinator-preload',sha256:createHash('sha256').update(content).digest('hex')});}
 }
 return parts.join('\n\n');
}
export function pageGeometry(session,n,{auto=false}={}){
 const s=session.plan?.slides[n-1],c=s?.materialSnapshot;if(!c)return null;
 if(s.kind==='agenda'&&agendaItemCount(c)&&agendaItemCount(c)!==s.bullets?.length)return null;
 if(s.kind==='ending'&&c.purpose!=='ending')return null;
 try{const units=contentUnits(s).map(u=>u.id),probe=composeHermesSlide({...s,layoutRecipe:s.manualDesign?.recipe||(auto?'auto':s.layoutRecipe),materialBindings:c.slots.map(slot=>({slot:slot.index,key:slot.key,text:slot.fixed||'预检',contentIds:units})),adaptation:{status:'checked'}},n-1,session.template),r=probe?.layoutReview;return r&&r.sourceObjects===r.retainedObjects&&r.materialUsage?.area>=.45?{recipe:probe.layoutRecipe,review:r}:null;}catch{return null;}
}
export function pageIsComplete(session,n){
 const s=session.plan?.slides[n-1];if(!s)return false;
 if(session.isNativeCover(n))return true;
 if(session.plan.designProfile==='research-defense')return !researchPageErrors(s,session.input.document).length;
 if(s.chart)return !s.chart.copyNeedsRepair&&Boolean(s.materialAnalysis?.kind==='chart'||s.chart.preparedByWorkflow);
 return Boolean(s.adaptation?.status==='checked'&&s.materialSnapshot&&s.materialBindings&&!validateAdaptation(s,s.materialSnapshot,s.materialBindings).length&&pageGeometry(session,n));
}
export async function runParallelHermesWorkflow(body,{onPhase=()=>{},onPlan=()=>{},onProgress=()=>{},checkpointId=randomUUID(),resumeCheckpoint,runAgent=runHermes}={}){
 const restored=resumeCheckpoint||await loadWorkflowCheckpoint(checkpointId),request={...(restored?.body||{}),...body,...(restored?.plan?{outlinePlan:restored.plan,draftBindings:restored.draftBindings}:{} )};
 request.requireNativeCheck=true;
 const session=await createHermesSession(request,{onPhase,onPlan}),key=session.input.apiKey||modelApiKey();if(!key)throw Error('请先配置 DeepSeek API Key');
 request.templateId=session.template.id;
 const templateSignature=createHash('sha256').update(JSON.stringify({id:session.baseTemplate.id,width:session.baseTemplate.width,height:session.baseTemplate.height,theme:session.baseTemplate.theme,safeArea:session.baseTemplate.safeArea,bnaProfile:session.baseTemplate.bnaProfile})).digest('hex');
 const options=executionOptions(request),metrics=[...(restored?.metrics||[])],started=Date.now(),failures=new Map(),used=new Set(),evidenceForPages=preparePageEvidence(session.input.document);let pool={},stage='planning',phase='叙事智能体：识别风格并规划逐页方案',stageStarted=started;
 const pageErrors=new Map(restored?.pageErrors||[]);for(const failed of restored?.progress?.failedPages||[])if(!pageErrors.has(+failed.page))pageErrors.set(+failed.page,{page:+failed.page,issues:[String(failed.error||'')]});
 let plannerDraft=restored?.plannerDraft,planningError=restored?.planningError;
 const runs=structuredClone(restored?.runs||(restored?.metrics||[]).map(m=>({runId:m.runId,role:m.role,status:'finished'})));
 const priorElapsed=restored?.timing?.totalActiveMs||restored?.progress?.elapsedMs||0,stageMs={...(restored?.timing?.stageMs||{})};
 const timing=()=>({totalActiveMs:priorElapsed+Date.now()-started,stageMs:{...stageMs,[stage]:(stageMs[stage]||0)+(Date.now()-stageStarted)},historyComplete:restored?restored.timing?.historyComplete===true:true});
 const enterStage=next=>{const now=Date.now();stageMs[stage]=(stageMs[stage]||0)+now-stageStarted;stageStarted=now;stage=next;};
 const progress=()=>{const errors=new Map([...pageErrors].map(([n,e])=>[+n,e.issues?.join('；')||'页面检查未通过']));for(const [n,e]of failures)errors.set(+n,e);return {stage,totalPages:session.plan?.slides.length||0,completedPages:session.plan?session.plan.slides.map((_,i)=>i+1).filter(n=>!errors.has(n)&&pageIsComplete(session,n)):[],activePages:pool.activePages||[],failedPages:[...errors].map(([page,error])=>({page,error})),concurrency:options.concurrency,batchSize:options.batchSize,workers:(pool.workers||[]).map(w=>({...w,id:w.id||`writer-${w.workerId}`,status:w.status==='working'?'running':w.status})),elapsedMs:timing().totalActiveMs,modelRequests:metrics.reduce((n,m)=>n+(m.modelRequests||0),0),resumable:stage!=='done'};};
 let writeChain=Promise.resolve();
 const persist=async(status='running',extra={})=>{
  const {outlinePlan,draftBindings,...storedRequest}=request;
  const snapshot={id:checkpointId,checkpointId,status,phase,body:storedRequest,templateSignature,templateSignatureVersion:2,plan:session.plan,plannerDraft,planningError,draftBindings:session.drafts,pageErrors:[...pageErrors],runs,workflowTrace:session.trace.slice(-240),progress:progress(),resumable:status==='failed',metrics,timing:timing(),createdAt:restored?.createdAt||new Date().toISOString(),...extra};
  // Clone at event time, then serialize writes; concurrent page commits never overwrite newer state.
  const copy=structuredClone(snapshot);writeChain=writeChain.then(()=>saveWorkflowCheckpoint(checkpointId,copy));await writeChain;onProgress({...copy.progress,checkpointId});return copy;
 };
 const change=async(next,label)=>{enterStage(next);phase=label;onPhase(label);await persist();};
 const met=m=>metrics.push(m);
 const executeAgent=async args=>{throwIfTaskStopped();
  const run={runId:args.id,role:args.role,pages:args.assignedPages,status:'running',startedAt:new Date().toISOString()};runs.push(run);await persist();
  try{const result=await runAgent(args);throwIfTaskStopped();return result;}catch(error){run.status=isTaskStopped(error)?'stopped':'failed';throw error;}
  finally{if(run.status==='running')run.status='finished';run.finishedAt=new Date().toISOString();await persist();}
 };
 try{
  if(restored?.templateSignatureVersion===2&&restored.templateSignature!==templateSignature)throw Error('用户模板参数在中断后发生变化，请重新生成以避免混合两个版式');
  const planningSkills=await roleSkills(session,['presentation-style','ppt-writing']);
  await roleSkills(session,['material-use','layout-review','harness-review']);
  if(!session.plan||!session.styleDecision){
   await change('planning',phase);
   const brief=await session.handle('ppt_get_brief'),palettes=await session.handle('ppt_palette_candidates');
   await executeAgent({id:randomUUID(),apiKey:key,model:session.input.model,role:'planner',allowSkillTool:false,maxIterations:4,maxTokens:18000,timeoutMs:300000,systemPrompt:rules+'\n'+PLANNER_CONTRACT+'\n'+planningSkills,message:JSON.stringify({brief,paletteCandidates:palettes,previousDraft:plannerDraft,previousError:planningError,chartRules:session.input.chartRequest?session.input.chartPrompt:undefined}),tools:[storyboardTool(session.input.pageCount,{maxSections:navigationPolicy(session.template).maxSections})],onTool:async(name,args)=>{
    if(name!==STORYBOARD_TOOL.name)throw Error('规划角色只能提交逐页方案');
    plannerDraft=structuredClone(args);
    try{await session.handle('ppt_classify_document',args.style);const result=await session.handle('ppt_submit_outline',{plan:args.plan});planningError=result.ok?undefined:(result.issues||[]).join('；');await persist();return result;}
    catch(error){planningError=error.message;await persist();throw error;}
   },completeWhen:(name,r)=>name===STORYBOARD_TOOL.name&&r.ok,onMetrics:met});
  }
  if(!session.plan||!session.styleDecision)throw Error('叙事智能体尚未提交有效大纲；断点已保存');
  if(!session.plan.designLock)session.plan.designLock=createPresentationContract(session.plan,session.template,session.input);
  for(const slide of session.plan.slides)slide.materialRequest=slideTagRequirements(slide,session.input.requirements);
  onPlan(session.plan);await persist();
  if(session.input.planningOnly){
   enterStage('done');phase='逐页方案已就绪，等待确认后制作';const finalTiming=timing();
   const output={planningOnly:true,plan:session.plan,pages:session.plan.slides.length,title:session.plan.title,execution:{mode:'parallel',checkpointId,metrics,summary:executionSummary(metrics,finalTiming)}};
   await persist('done',{output});return output;
  }
  const research=session.plan.designProfile==='research-defense',writingSkills=await roleSkills(session,['ppt-writing','material-use'],{research});
  const charts=session.plan.slides.map((s,i)=>s.chart?i+1:null).filter(Boolean);
  if(charts.length){await roleSkills(session,['chart-drawing']);for(const n of charts){const pendingCopy=restored?.plan?.slides[n-1]?.chart||session.plan.slides[n-1].chart;await session.handle('ppt_prepare_charts',{pages:[{page:n,chart:session.plan.slides[n-1].chart}]});Object.assign(session.plan.slides[n-1].chart,{preparedByWorkflow:true,copyNeedsRepair:Boolean(pendingCopy.copyNeedsRepair),copyIssues:pendingCopy.copyIssues});}}
  await change('materials','素材协调器：检查原生对象、原字号容量与候选构图');
  const visualWork=[],reservations=new Set(used);
  const fallbackTemplate=async(slide,excludeIds=[])=>{
   const generated=await generatePageTemplate(slide,{components:session.catalog.items,template:session.template,sourceId:session.input.paletteSourceId||session.plan.palette?.sourceId,runAgent:executeAgent,apiKey:key,model:session.input.model,onPhase,onMetrics:met,excludeIds});
   session.catalog.items.push(generated.component);return generated;
  };
  if(!research){
   for(const [i,s] of session.plan.slides.entries()){
    const n=i+1;if(session.isNativeCover(n)||s.chart)continue;
    if(s.materialSnapshot&&!used.has(materialIdentity(s.materialSnapshot))&&pageGeometry(session,n,{auto:true})){
     const fresh=await analyzeMaterial(s.materialSnapshot);
     if(fresh.fingerprint!==s.materialSnapshot.fingerprint)throw Error(`第 ${n} 页的素材版本已经变化，已停止恢复以避免文字错位`);
     for(const slot of fresh.slots){const old=s.materialSnapshot.slots.find(v=>v.key===slot.key);if(old)slot.maxChars=Math.min(slot.maxChars,old.maxChars);}
     s.materialSnapshot=fresh;
     const refreshedGeometry=pageGeometry(session,n,{auto:true});
     if(refreshedGeometry){s.layoutRecipe=refreshedGeometry.recipe;used.add(s.materialId);used.add(materialIdentity(s.materialSnapshot));used.add(s.materialSnapshot.familyId);reservations.add(materialIdentity(s.materialSnapshot));continue;}
    }
    try{
     const candidates=await prepareVisualCandidates(s,session.catalog.items,{template:session.template,preferredSourceId:session.input.paletteSourceId||session.plan.palette?.sourceId,referenceId:session.plan.referenceId,used:reservations,limit:4});
     if(!candidates.length)candidates.push(await fallbackTemplate(s));
     visualWork.push({page:n,slide:s,candidates});for(const candidate of candidates){reservations.add(candidate.component.id);reservations.add(materialIdentity(candidate.component));}
    }catch(e){if(isTaskStopped(e))throw e;failures.set(n,e.message);}
    await persist();
   }
  }
  const acceptVisualSelection=async(n,choice)=>{
    const repeated=session.plan.slides.findIndex((s,i)=>i!==n-1&&s.materialSnapshot&&materialIdentity(s.materialSnapshot)===materialIdentity(choice.component));
    if(repeated>=0)throw Error(`第 ${n} 页与第 ${repeated+1} 页素材重复，请更换设计`);
    await session.handle('ppt_analyze_materials',{selections:[{page:n,materialId:choice.component.id}]});
    await session.handle('ppt_set_layouts',{pages:[{page:n,recipe:choice.layout.layoutRecipe}]});
    const slide=session.plan.slides[n-1],requestedVisual=slide.visual;
    slide.visualSelection={...choice.metadata,requestedVisual};slide.tagMatch=choice.tagMatch;
    if(['parallel','process','compare','hierarchy','cycle','text','architecture','timeline','responsibility','hub','matrix'].includes(choice.component.relation))slide.visual=choice.component.relation;
    await persist();
  };
  if(visualWork.length){
   await change('visual-selection','视觉选版智能体：查看候选缩略图并确定页面构图');
   const selected=await selectVisualPages(visualWork,{apiKey:key,model:session.input.model,checkpointId,designLock:session.plan.designLock,requirements:session.input.requirements,onPhase,onMetrics:met,runAgent:executeAgent,concurrency:options.concurrency,batchSize:options.visualBatchSize,onSelection:acceptVisualSelection});
   for(const f of selected.failures)for(const n of f.pages)if(!selected.choices.has(n))failures.set(n,String(f.error));
   onPlan(session.plan);await persist();
  }
  const writePages=async(pages,initialErrors=[])=>{
   if(!pages.length)return;
   await change('writing',`每页独立智能体，最多 ${options.concurrency} 页并行修改，完成一页保存一页`);
   const result=await runPageAgents(pages,{concurrency:options.concurrency,isComplete:n=>pageIsComplete(session,n),onProgress:p=>{pool=p;onProgress({...progress(),checkpointId});},worker:async(page,{role})=>{
    const batch=[page];
    let lastErrors=initialErrors.length?initialErrors.filter(e=>batch.includes(+e.page)):batch.map(n=>pageErrors.get(n)).filter(Boolean);
    for(let attempt=0;attempt<2;attempt++){
     const pending=batch.filter(n=>!pageIsComplete(session,n));if(!pending.length)return {pages:batch};
     const allowed=new Set(pending),signatures=new Map();let repeatedFailure=false;
     const context=pending.map(n=>writerPageContext(session,n,lastErrors));
     await executeAgent({id:randomUUID(),apiKey:key,model:session.input.model,role,assignedPages:[page],allowSkillTool:false,maxIterations:4,maxTokens:12000,timeoutMs:300000,systemPrompt:rules+'\n本实例只负责一页。只提交分配页码的内容，不能修改其他页、选择其他页的素材或发布整稿。完成由总控汇总。\n'+(research?RESEARCH_WRITER_CONTRACT:WRITER_CONTRACT)+'\n'+writingSkills,message:JSON.stringify({pages:context,evidence:evidenceForPages(pending.map(n=>session.plan.slides[n-1])),requirements:session.input.requirements,designProfile:session.plan.designProfile,designLock:session.plan.designLock}),tools:pageScopedTools(toolsFor([research?'ppt_research_pages':'ppt_commit_pages']),page),onTool:async(name,args)=>{
      if(![research?'ppt_research_pages':'ppt_commit_pages'].includes(name)||!Array.isArray(args.pages)||args.pages.length!==1||args.pages.some(p=>!allowed.has(Number(p.page))))throw Error('写作智能体只能提交其分配的一页');
      let response;try{response=await session.handle(name,args);}catch(e){if(isTaskStopped(e))throw e;response={ok:false,errors:args.pages.map(p=>({page:Number(p.page),issues:[e.message]}))};}
      lastErrors=response.errors||[];const sig=JSON.stringify(lastErrors);if(lastErrors.length){signatures.set(sig,(signatures.get(sig)||0)+1);if(signatures.get(sig)>=2){response.stopRepeatedFailure=true;repeatedFailure=true;}}
      for(const n of pending){if(pageIsComplete(session,n)){failures.delete(n);pageErrors.delete(n);}else {const error=lastErrors.find(e=>+e.page===n);if(error)pageErrors.set(n,error);}}
      await persist();return response;
     },completeWhen:(_,r)=>r.stopRepeatedFailure||pending.every(n=>pageIsComplete(session,n)),onMetrics:met});
     if(repeatedFailure)break;
    }
    const remaining=batch.filter(n=>!pageIsComplete(session,n));if(remaining.length)throw Error('页面未通过内容校验：'+remaining.map(n=>`第${n}页 `+(lastErrors.find(e=>+e.page===n)?.issues?.join('；')||'尚未提交完整文案')).join('；'));
    return {pages:batch};
   }});
   for(const f of result.failures)for(const n of f.pages)if(!pageIsComplete(session,n))failures.set(n,f.error?.message||String(f.error));
   pool={activePages:[],workers:[]};await persist();
  };
  const refineCharts=async pages=>{
   if(!pages.length)return;const chartSkills=await roleSkills(session,['chart-drawing']);
   await change('writing',`图表文字每页独立修复，最多 ${options.concurrency} 页并行`);
   const result=await runPageAgents(pages,{concurrency:options.concurrency,role:'chart-copy',isComplete:n=>!session.plan.slides[n-1].chart.copyNeedsRepair,onProgress:p=>{pool=p;onProgress({...progress(),checkpointId});},worker:async(page,{role})=>{
    await executeAgent({id:randomUUID(),apiKey:key,model:session.input.model,role,assignedPages:[page],allowSkillTool:false,maxIterations:4,maxTokens:2500,systemPrompt:rules+'\n你是单页图表文字修复智能体。仅精简本页页面标题和图表标题，保留主体、统计含义与单位，不修改任何数据或来源，不提交其他页，不发布整稿。通过ppt_refine_chart_copy提交本页标题。\n'+chartSkills,message:JSON.stringify({designLock:session.plan.designLock,pages:[{page,title:session.plan.slides[page-1].title,chartTitle:session.plan.slides[page-1].chart.title,issues:session.plan.slides[page-1].chart.copyIssues}],evidence:evidenceForPages([session.plan.slides[page-1]])}),tools:pageScopedTools(toolsFor(['ppt_refine_chart_copy']),page),onTool:async(name,args)=>{if(name!=='ppt_refine_chart_copy'||!Array.isArray(args.pages)||args.pages.some(p=>Number(p.page)!==page))throw Error('图表修复只能修改分配页面');const r=await session.handle(name,args);await persist();return r;},completeWhen:()=>!session.plan.slides[page-1].chart.copyNeedsRepair,onMetrics:met});
    if(session.plan.slides[page-1].chart.copyNeedsRepair)throw Error(`第 ${page} 页图表标题尚未完成精简`);
   }});
   for(const f of result.failures)for(const n of f.pages)failures.set(n,String(f.error));
   pool={activePages:[],workers:[]};await persist();
  };
  await refineCharts(charts.filter(n=>session.plan.slides[n-1].chart.copyNeedsRepair));
  await writePages(session.plan.slides.map((_,i)=>i+1).filter(n=>!pageIsComplete(session,n)&&!failures.has(n)));
  const stuck=session.plan.slides.map((_,i)=>i+1).filter(n=>!pageIsComplete(session,n)&&!session.isNativeCover(n)&&!session.plan.slides[n-1].chart);
  if(!research&&stuck.length){
   await change('materials','局部改选：仅为未通过页面寻找更适合容量的素材，保留已完成页面');
   const retryWork=[],occupied=new Set(session.plan.slides.flatMap(s=>[s.materialId,s.materialSnapshot?.familyId]).filter(Boolean));
   for(const n of stuck.filter(n=>!session.plan.slides[n-1].manualDesign)){const slide=session.plan.slides[n-1],old=slide.materialSnapshot,excludeIds=session.catalog.items.filter(c=>c.id===slide.materialId||old&&c.sourceId===old.sourceId&&c.page===old.page).map(c=>c.id);const candidates=await prepareVisualCandidates(slide,session.catalog.items,{template:session.template,preferredSourceId:session.input.paletteSourceId||session.plan.palette?.sourceId,referenceId:session.plan.referenceId,used:occupied,excludeIds,limit:3});if(!candidates.length)candidates.push(await fallbackTemplate(slide,excludeIds));if(candidates.length)retryWork.push({page:n,slide,candidates});}
   if(retryWork.length){await change('visual-selection','视觉复选：只比较未通过页面的新素材');const retried=await selectVisualPages(retryWork,{apiKey:key,model:session.input.model,checkpointId,requirements:session.input.requirements+'\n上一版文字容量不适配；优先充足正文区，短标签不重复整句或完整日期。',onPhase,onMetrics:met,runAgent:executeAgent,concurrency:options.concurrency,batchSize:options.visualBatchSize,onSelection:async(n,choice)=>{await acceptVisualSelection(n,choice);pageErrors.delete(n);}});await writePages([...retried.choices.keys()]);}
  }
  if(research&&!session.plan.slides.some(s=>s.researchAssets?.length||s.chart?.status==='ready')){
   const choices=await session.handle('ppt_search_research_assets',{query:session.plan.slides[0].title,limit:1});if(choices.items[0])await session.handle('ppt_attach_research_assets',{pages:[{page:1,assetIds:[choices.items[0].id]}]});
  }
  const unfinished=()=>session.plan.slides.map((_,i)=>i+1).filter(n=>!pageIsComplete(session,n));
  if(unfinished().length){const e=Error(`已保存 ${session.plan.slides.length-unfinished().length}/${session.plan.slides.length} 页；剩余页面可从断点继续：${unfinished().join('、')}`);e.pageFailures=[...failures];throw e;}
  await change('content-review','内容关联审校：逐页核对主题、模块标题与正文');
  for(let attempt=0;attempt<2;attempt++){
   const semantic=await session.reviewRelevance({runAgent:executeAgent,onMetrics:met});
   for(const row of semantic.pages.filter(r=>r.status==='pass')){pageErrors.delete(row.page);failures.delete(row.page);}
   for(const row of semantic.issues)pageErrors.set(row.page,{page:row.page,missingSlots:row.issues.flatMap(i=>i.slots),issues:row.issues.map(i=>'位置 '+i.slots.join('、')+' '+i.reason)});
   await persist();if(semantic.passed)break;
   if(attempt===1)throw Error('内容关联审校仍需调整：'+semantic.issues.map(r=>'第 '+r.page+' 页：'+r.reason).join('；'));
   const replacements=[],reserved=new Set(session.plan.slides.flatMap(s=>[s.materialId,materialIdentity(s.materialSnapshot)]).filter(Boolean));
   for(const row of semantic.issues.filter(r=>r.status==='replace-material')){
    if(session.plan.slides[row.page-1].manualDesign){failures.set(row.page,'用户选择的素材与本页内容结构不符，请在右侧重新选择设计');throw Error('第 '+row.page+' 页需人工重选设计：'+row.reason);}
    const slide=session.plan.slides[row.page-1];if(row.recommendedModuleCount)slide.materialRequest={...slide.materialRequest,moduleCount:row.recommendedModuleCount,moduleCountExplicit:true};
    const candidates=await prepareVisualCandidates(slide,session.catalog.items,{template:session.template,preferredSourceId:session.input.paletteSourceId||session.plan.palette?.sourceId,referenceId:session.plan.referenceId,used:reserved,limit:3});
    if(!candidates.length)candidates.push(await fallbackTemplate(slide));
    replacements.push({page:row.page,slide,candidates});for(const c of candidates){reserved.add(c.component.id);reserved.add(materialIdentity(c.component));}
   }
   if(replacements.length)await selectVisualPages(replacements,{apiKey:key,model:session.input.model,checkpointId,requirements:session.input.requirements+'\\n内容关联审校：选择真实主题与模块数一致的设计，不通过重复要点填槽。',designLock:session.plan.designLock,onPhase,onMetrics:met,runAgent:executeAgent,concurrency:options.concurrency,batchSize:options.visualBatchSize,onSelection:async(n,choice)=>{await acceptVisualSelection(n,choice);pageErrors.delete(n);}});
   for(const row of semantic.issues)session.plan.slides[row.page-1].adaptation=undefined;
   await writePages(semantic.issues.map(r=>r.page),semantic.issues.map(r=>pageErrors.get(r.page)).filter(Boolean));
  }
  await change('review','审校协调器：汇总内容覆盖、对象保留与布局检查');
  let review=await session.handle('ppt_review_layout');if(!review.ok)throw Error(review.issues.join('；'));
  const harness=await session.handle('ppt_audit_skills');if(!harness.passed)throw Error('技能检查未通过');
  const reviewed=await session.handle('ppt_harness_review');if(!reviewed.passed)throw Error('整稿审校未通过：'+JSON.stringify(reviewed.errors).slice(0,700));
  await change('export','统一导出队列：生成可编辑PPT与PowerPoint文字检查');
  try{await session.handle('ppt_publish');}catch(e){
   const affected=[...new Set((e.issues||[]).map(x=>+x.page).filter(n=>n>=1&&n<=session.plan.slides.length))];
   if(!affected.length)throw e;
   const chartPages=affected.filter(n=>session.plan.slides[n-1].chart);
   for(const n of affected){const s=session.plan.slides[n-1];if(s.chart){s.chart.copyNeedsRepair=true;s.chart.copyIssues=(e.issues||[]).filter(x=>+x.page===n);}else if(research)s.research=undefined;else s.adaptation=undefined;
    const pageIssues=(e.issues||[]).filter(x=>+x.page===n);
    for(const issue of pageIssues){const slot=s.materialSnapshot?.slots?.find(v=>v.index===issue.slot||v.key===issue.key);if(!slot||slot.fixed)continue;const ratio=Math.min(1,issue.availableHeight/issue.initialBoundHeight||1,issue.availableWidth/issue.initialBoundWidth||1),limit=Math.max(1,Math.floor(String(issue.text||'').length*ratio*.82));slot.maxChars=Math.min(slot.maxChars,limit);}
    s.notes=(s.notes||'')+'\n原字号排版修复：'+pageIssues.map(x=>`位置 ${x.slot??x.key??x.name}「${x.text||''}」需在原字号下进一步精简，按最新maxChars填写；字号不变`).join('；');}
   const targetedCopyErrors=affected.map(n=>({page:n,missingSlots:(e.issues||[]).filter(x=>+x.page===n).map(x=>session.plan.slides[n-1].materialSnapshot?.slots?.find(s=>s.index===x.slot||s.key===x.key)?.index).filter(Number.isInteger),issues:(e.issues||[]).filter(x=>+x.page===n).map(x=>`位置 ${x.slot??x.key??x.name} 按原字号进一步精简`)}));for(const error of targetedCopyErrors)pageErrors.set(error.page,error);
   await persist();await refineCharts(chartPages);await writePages(affected.filter(n=>!chartPages.includes(n)),targetedCopyErrors);if(unfinished().length)throw e;
   const semantic=await session.reviewRelevance({runAgent:executeAgent,onMetrics:met});if(!semantic.passed)throw Error('文字精简后的主题关联审校未通过，具体问题已保留');
   review=await session.handle('ppt_review_layout');if(!review.ok)throw Error(review.issues.join('；'));
   const check=await session.handle('ppt_harness_review');if(!check.passed)throw Error('局部修复后的整稿审校未通过');
   await change('export','局部修复完成，重新执行统一导出与文字检查');
   try{await session.handle('ppt_publish');}catch(overflow){
    if(isTaskStopped(overflow)||!overflow.issues?.length)throw overflow;
    const pages=[...new Set(overflow.issues.map(i=>Number(i.page)).filter(n=>n>0&&n<=session.plan.slides.length))],replacements=[];
    for(const n of pages){const slide=session.plan.slides[n-1];if(slide.chart||research||session.isNativeCover(n)||['cover','ending'].includes(slide.kind))throw overflow;
     const old=slide.materialSnapshot,excludeIds=session.catalog.items.filter(c=>c.id===slide.materialId||old&&c.sourceId===old.sourceId&&c.page===old.page).map(c=>c.id),used=new Set(session.plan.slides.flatMap((s,i)=>i===n-1?[]:[s.materialId,materialIdentity(s.materialSnapshot)]).filter(Boolean));
     const candidates=await prepareVisualCandidates(slide,session.catalog.items,{template:session.template,preferredSourceId:session.input.paletteSourceId||session.plan.palette?.sourceId,referenceId:session.plan.referenceId,used,excludeIds,limit:3});
     if(!candidates.length)candidates.push(await fallbackTemplate(slide,excludeIds));replacements.push({page:n,slide,candidates});
    }
    await change('materials','原字号仍溢出：换用适配版式，无候选时生成本页模板');
    // The current request explicitly authorizes the fallback after copy repair.
    for(const row of replacements)delete session.plan.slides[row.page-1].manualDesign;
    await selectVisualPages(replacements,{apiKey:key,model:session.input.model,checkpointId,requirements:session.input.requirements+'\\n原字号溢出，请选择正文区域充足的版式。',designLock:session.plan.designLock,onPhase,onMetrics:met,runAgent:executeAgent,concurrency:options.concurrency,batchSize:options.visualBatchSize,onSelection:async(n,choice)=>{await acceptVisualSelection(n,choice);pageErrors.delete(n);failures.delete(n);}});
    await writePages(pages);if(unfinished().length)throw overflow;
    const semantic=await session.reviewRelevance({runAgent:executeAgent,onMetrics:met});if(!semantic.passed)throw Error('换版后内容关联检查未通过，已保存进度');
    const layout=await session.handle('ppt_review_layout');if(!layout.ok)throw Error(layout.issues.join('；'));
    const check=await session.handle('ppt_harness_review');if(!check.passed)throw Error('换版后整稿检查未通过');
    await persist();await change('export','本页换版已完成，重新检查并导出');await session.handle('ppt_publish');
   }
  }
  await recordMaterialUses(session.output);
  enterStage('done');phase='可编辑PPT与全页预览已完成';const finalTiming=timing(),output={...session.output,execution:{mode:'parallel',...options,checkpointId,metrics,elapsedMs:finalTiming.totalActiveMs,runElapsedMs:Date.now()-started,summary:executionSummary(metrics,finalTiming)}};
  await atomicUpdateJson(path.join(dataDir,'outputs',output.id+'.json'),{},record=>{record.execution=output.execution;});
  await persist('done',{output});return output;
 }catch(e){await persist(isTaskStopped(e)?'stopped':'failed',{error:isTaskStopped(e)?undefined:e.message,resumable:true,...(isTaskStopped(e)?{phase:'已停止，进度已保存'}:{})}).catch(()=>{});e.checkpointId=checkpointId;e.resumable=true;e.progress=progress();throw e;}
}
