import {createTaskControl,runWithTaskControl,releaseTaskControl,throwIfTaskStopped,isTaskStopped} from './task-control.mjs';
import {AsyncResource} from 'node:async_hooks';
import {modelApiKey} from './model-connections.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {dataDir} from './library.mjs';
import {runHermes} from './hermes-client.mjs';
import {executionOptions} from './hermes-parallel.mjs';
import {inspectNativePage,patchNativePage,restoreNativePage,nativeEditSchema,mergeNativeEdits} from './native-page-editor.mjs';
import {storePageAsset} from './page-assets.mjs';
import {exportPageRevision} from './page-edit-export.mjs';
import {readComponents} from './components.mjs';
import {recommendMaterials} from './recommendations.mjs';
import {pageOverflowFeedback,constrainOverflowRepair} from './page-text-capacity.mjs';
import {pageSelection,enforcePageSelection,placeSelectedPhotos} from './page-selection.mjs';
import {saveWorkflowCheckpoint} from './workflow-checkpoints.mjs';

const uuid=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/i.test(s),sid=s=>typeof s==='string'&&/^[a-f0-9-]{36}-p\d{1,2}$/i.test(s);
const queues=new Map(),jobs=new Map(),pending=[];let running=0;
export const pageWorkspaceIsBusy=rootId=>[...jobs.values()].some(j=>j.rootId===rootId&&['queued','running','stopping'].includes(j.status));
const inspections=new Map();
const file=(kind,id)=>path.join(dataDir,kind,id+'.json');
async function read(kind,id){return JSON.parse(await fs.readFile(file(kind,id),'utf8'));}
async function write(kind,id,value){const folder=path.join(dataDir,kind);await fs.mkdir(folder,{recursive:true});const dest=file(kind,id),tmp=dest+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value,null,2));await fs.rename(tmp,dest);}
export async function withDocumentLock(key,task){const previous=queues.get(key)||Promise.resolve(),promise=previous.catch(()=>{}).then(task);queues.set(key,promise);try{return await promise;}finally{if(queues.get(key)===promise)queues.delete(key);}}
export async function readOutput(id){if(!uuid(id))throw Error('无效的演示版本');return read('outputs',id);}
async function rootState(outputId){
 const info=await readOutput(outputId),rootId=info.conversationRootId||info.plan?.conversationRootId||info.id;
 try{const state=await read('page-documents',rootId);if(info.id===state.headOutputId||[...jobs.values()].some(j=>j.rootId===rootId&&['queued','running','stopping'].includes(j.status)))return {info,state};const head=await readOutput(state.headOutputId);if(Date.parse(info.createdAt)<=Date.parse(head.createdAt))return {info,state};}catch(e){if(e.code!=='ENOENT')throw e;}
 return withDocumentLock('document:'+rootId,async()=>{let state;try{state=await read('page-documents',rootId);const head=await readOutput(state.headOutputId);if(info.plan?.conversationRootId&&Date.parse(info.createdAt)>Date.parse(head.createdAt)){state.headOutputId=info.id;state.revision++;await write('page-documents',rootId,state);}}catch(e){if(e.code!=='ENOENT')throw e;state={rootId,headOutputId:info.id,revision:info.revisionNumber||0};await write('page-documents',rootId,state);}return {info,state};});
}
export async function openPageSession(outputId,page){
 const {state}=await rootState(outputId),info=await readOutput(state.headOutputId);if(!Number.isInteger(page)||!info.plan.slides[page])throw Error('页面编号无效');
 const id=state.rootId+'-p'+(page+1);let session;try{session=await read('page-sessions',id);}catch(e){if(e.code!=='ENOENT')throw e;session={id,rootId:state.rootId,page,messages:[],uploads:[],createdAt:new Date().toISOString()};await write('page-sessions',id,session);}
 if(session.activeJobId&&!jobs.has(session.activeJobId)){session.activeJobId=null;session.messages.push({id:randomUUID(),role:'assistant',content:'上次修改已中断，原稿和照片仍然保留。可以再次发送本页要求。',createdAt:new Date().toISOString()});await write('page-sessions',id,session);}
 const cacheKey=info.id+':'+page;if(!inspections.has(cacheKey)){const promise=fs.readFile(path.join(dataDir,'outputs',info.id+'.pptx')).then(bytes=>inspectNativePage(bytes,page));inspections.set(cacheKey,promise);void promise.catch(()=>inspections.delete(cacheKey));if(inspections.size>60)inspections.delete(inspections.keys().next().value);}const inspection=await inspections.get(cacheKey);
 return {...session,currentOutputId:info.id,revision:state.revision,inspection,job:session.activeJobId?publicJob(jobs.get(session.activeJobId)):null};
}
export async function uploadSessionPhotos(id,files){
 if(!sid(id))throw Error('无效的页面会话');if(!files?.length||files.length>6)throw Error('每次可上传1–6张照片');
 return withDocumentLock('session:'+id,async()=>{const session=await read('page-sessions',id),photos=[];for(const f of files)photos.push(await storePageAsset(f.buffer,Buffer.from(f.originalname,'latin1').toString('utf8'),id));session.uploads.push(...photos);await write('page-sessions',id,session);return {photos};});
}
const publicJob=j=>j&&({id:j.id,page:j.page,status:j.status,phase:j.phase,error:j.error,outputId:j.outputId});
export async function pageWorkspaceState(rootId){if(!uuid(rootId))throw Error('无效的演示编号');const state=await read('page-documents',rootId);return {...state,jobs:[...jobs.values()].filter(j=>j.rootId===rootId).slice(-40).map(publicJob)};}
export function validatePageProposal(proposal,inspection,assetIds){
 if(typeof proposal?.reply!=='string'||!proposal.reply.trim())throw Error('请说明本页修改结果或需要澄清的问题');if(!Array.isArray(proposal.operations)||proposal.operations.length>80)throw Error('本页修改指令格式不正确');
 const operations=proposal.operations.map(o=>nativeEditSchema.parse(o));for(const op of operations){const id=op.shapeId||op.targetShapeId,target=id?inspection.shapes.find(s=>s.id===id):null;if(id&&!target)throw Error(`对象 ${id} 不在本页`);if(op.type==='text'&&target.type!=='text')throw Error(`对象 ${id} 不是文字`);if(op.type==='style'&&['group','diagram'].includes(target.type))throw Error('组合样式请修改其子图形；组合移动使用frame');if(op.type==='image'&&target&&!['text','image','shape'].includes(target.type))throw Error('照片只能替换具体图片或图形框');if(op.type==='image'&&!assetIds.has(op.assetId))throw Error('照片不属于当前页会话');}return {reply:proposal.reply.slice(0,5000),operations};
}
async function pageEditInstructions(){return fs.readFile(path.resolve('agents/skills/page-edit/SKILL.md'),'utf8');}
async function recordPageJob(job){
 const current=job.page+1,total=job.totalPages||current;
 return saveWorkflowCheckpoint(job.id,{status:job.status,phase:job.phase,error:job.error,createdAt:job.createdAt,resumable:false,body:{taskKind:'page-edit',rootId:job.rootId,page:current,model:job.model,title:job.title},plan:{title:job.title,slides:job.slideTitles||[]},progress:{totalPages:total,completedPages:Array.from({length:total},(_,i)=>i+1).filter(n=>n!==current||job.status==='done'),activePages:job.status==='running'?[current]:[],failedPages:job.status==='failed'?[current]:[],elapsedMs:Date.now()-Date.parse(job.createdAt)},metrics:job.metrics||[],runs:job.runs||[],workflowTrace:job.trace||[],...(job.outputId?{output:{id:job.outputId}}:{})});
}
function pagePhase(job,phase){if(job.status==='stopping')return;if(job.phase!==phase){job.phase=phase;(job.trace||=[]).push({name:phase,skill:'page-edit',at:new Date().toISOString()});}void recordPageJob(job).catch(()=>{});}
const operationProperties={
 type:{type:'string',enum:['text','image','frame','style','clone','delete','shape']},shapeId:{type:'integer'},text:{type:'string'},assetId:{type:'string'},targetShapeId:{type:'integer'},operationId:{type:'string'},rotation:{type:'number'},fill:{type:'string'},stroke:{type:'string'},strokeWidth:{type:'number'},geometry:{type:'string',enum:['rect','roundRect','ellipse','rightArrow','leftArrow','chevron','diamond','triangle','hexagon','line']},fontSize:{type:'number'},textColor:{type:'string'},
 box:{type:'object',properties:{x:{type:'number'},y:{type:'number'},w:{type:'number'},h:{type:'number'}},required:['x','y','w','h']},
 fit:{type:'string',enum:['contain','cover']},
 style:{type:'object',properties:{fontSize:{type:'number'},bold:{type:'boolean'},align:{type:'string',enum:['left','center','right']},vAlign:{type:'string',enum:['top','middle','bottom']}}}
};
const EDIT_TOOL={name:'ppt_submit_page_edit',description:'Submit a reply and native edits for this page only.',parameters:{type:'object',properties:{reply:{type:'string'},operations:{type:'array',maxItems:80,items:{type:'object',properties:operationProperties,required:['type']}}},required:['reply','operations']}};
function drain(){while(running<executionOptions({}).concurrency&&pending.length){running++;const fn=pending.shift();void fn().catch(()=>{}).finally(()=>{running--;drain();});}}
function enqueuePageJob(job,execute){
 let wrapped;
 const control=createTaskControl(job.id,{kind:'page-edit',onStop:async()=>{
  job.status='stopping';job.phase='正在停止，等待当前操作安全结束';await recordPageJob(job);
  const index=pending.indexOf(wrapped);if(index>=0){pending.splice(index,1);await wrapped();}
 }});
 wrapped=AsyncResource.bind(()=>runWithTaskControl(control,execute).finally(()=>releaseTaskControl(control)));
 pending.push(wrapped);drain();
}
export async function submitPageMessage(id,{message,assetIds=[],placements=[],selection,apiKey,model='deepseek-flash'}={}){
 if(!sid(id))throw Error('无效的页面会话');if(typeof message!=='string'||!message.trim()||message.length>8000)throw Error('请输入本页要求，最多8000字');if(!Array.isArray(assetIds)||assetIds.length>6||!Array.isArray(placements)||placements.length>6)throw Error('照片参数不正确');
 const key=apiKey||modelApiKey();if(!key)throw Error('请先配置DeepSeek API Key');
 return withDocumentLock('session:'+id,async()=>{const session=await read('page-sessions',id);if(session.activeJobId&&jobs.get(session.activeJobId)&&['queued','running','stopping'].includes(jobs.get(session.activeJobId).status))throw Error('本页正在修改，可以先切到其他页处理');
  for(const asset of assetIds)if(!session.uploads.some(p=>p.id===asset))throw Error('请选择本页已上传的照片');
  if(selection!==undefined){if(!selection||!Array.isArray(selection.shapeIds)||selection.shapeIds.length<1||selection.shapeIds.length>20||selection.shapeIds.some(id=>!Number.isInteger(id)||id<1)||typeof selection.fingerprint!=='string'||selection.fingerprint.length>128)throw Error('所选对象参数不正确');selection={shapeIds:selection.shapeIds,fingerprint:selection.fingerprint};}
  placements=placements.map(p=>{if(!assetIds.includes(p.assetId))throw Error('放置位置的照片必须在本条消息中');return nativeEditSchema.parse({type:'image',...p});});
  const job={id:randomUUID(),rootId:session.rootId,page:session.page,status:'queued',phase:'等待页面智能体',createdAt:new Date().toISOString(),model,metrics:[],runs:[],trace:[]};jobs.set(job.id,job);session.activeJobId=job.id;session.messages.push({id:randomUUID(),role:'user',content:message.trim(),assetIds,placements,selection,jobId:job.id,createdAt:new Date().toISOString()});await write('page-sessions',id,session);
  await recordPageJob(job);
  enqueuePageJob(job,()=>executePageEdit(id,job,{message:message.trim(),assetIds,placements,selection,key,model}));return {job:publicJob(job)};
 });
}
async function executePageEdit(sessionId,job,{message,assetIds,placements,selection,key,model}){
 let reply='',newOutput;
 try{
  throwIfTaskStopped();job.status='running';job.phase='读取本页原生文字与图片位置';const session=await read('page-sessions',sessionId),state=await read('page-documents',job.rootId),base=await readOutput(state.headOutputId),buffer=await fs.readFile(path.join(dataDir,'outputs',base.id+'.pptx')),inspection=await inspectNativePage(buffer,job.page),allowedAssets=new Set(session.uploads.map(a=>a.id));const scope=pageSelection(selection,inspection);let operations=[],feedback,workingInspection=inspection;job.totalPages=base.pages;job.title=base.plan.title+' · 第'+(job.page+1)+'页';job.slideTitles=base.plan.slides.map(({title})=>({title}));await recordPageJob(job);const instructions=await pageEditInstructions()+(base.plan.styleSkillSnapshot?'\n\n本演示采用的版式Skill，仅作为设计规范：\n'+base.plan.styleSkillSnapshot.content:'');
  const recommendations=recommendMaterials(base.plan.slides[job.page],(await readComponents()).items,{referenceId:base.plan.referenceId,limit:10}).items?.map(c=>({id:c.id,title:c.title,reason:c.reason}));
  for(let attempt=0;attempt<2;attempt++){
   pagePhase(job,attempt?'根据实际溢出位置修复本页':'Hermes正在修改本页');let proposal;const run={runId:randomUUID(),role:`page-chat-${job.page+1}`,status:'running',startedAt:new Date().toISOString()};job.runs.push(run);await recordPageJob(job);
   try{await runHermes({id:run.runId,apiKey:key,model,role:`page-chat-${job.page+1}`,allowSkillTool:false,maxIterations:3,maxTokens:6000,timeoutMs:240000,systemPrompt:instructions,message:JSON.stringify({page:job.page+1,title:base.plan.slides[job.page].title,shapes:workingInspection.shapes,requirements:message,selection:scope?{shapeIds:scope.shapeIds,rule:'只修改这些对象及其组合子对象，其他对象保持不变；选区外新增对象需先清除选区'}:undefined,recommendations,history:session.messages.slice(-6).map(m=>({role:m.role,content:m.content,assetIds:m.assetIds,placements:m.placements})),photos:session.uploads.filter(a=>assetIds.includes(a.id)||session.messages.slice(-6).some(m=>m.assetIds?.includes(a.id))).slice(-12).map(({id,name,width,height})=>({assetId:id,name,width,height})),placements,previousOperations:operations.length?operations:undefined,errors:feedback}),tools:[EDIT_TOOL],onTool:async(name,args)=>{if(name!==EDIT_TOOL.name)throw Error('单页智能体只能提交本页修改');const candidate=enforcePageSelection(validatePageProposal(args,workingInspection,allowedAssets),scope?{...scope,allowedIds:new Set([...scope.allowedIds,...workingInspection.shapes.filter(s=>!inspection.shapes.some(old=>old.id===s.id)).map(s=>s.id)])}:null);if(feedback)constrainOverflowRepair(candidate,operations,feedback);proposal=candidate;pagePhase(job,'已接收本页原生编辑操作');return {ok:true,operationCount:proposal.operations.length};},onMetrics:m=>{job.metrics.push(m);void recordPageJob(job).catch(()=>{});},completeWhen:(_,r)=>r.ok});run.status='done';}catch(e){run.status=isTaskStopped(e)?'stopped':'failed';throw e;}finally{run.finishedAt=new Date().toISOString();await recordPageJob(job);}
   throwIfTaskStopped();if(!proposal)throw Error('本页智能体尚未提交有效结果');reply=proposal.reply;if(!proposal.operations.length){if(feedback)throw Error('溢出问题尚未修复');break;}operations=mergeNativeEdits(operations,placeSelectedPhotos(proposal.operations,placements,scope?{...scope,allowedIds:new Set([...scope.allowedIds,...workingInspection.shapes.filter(s=>!inspection.shapes.some(old=>old.id===s.id)).map(s=>s.id)])}:null));
   try{
    pagePhase(job,'本页操作已生成，等待合并到最新整稿');newOutput=await withDocumentLock('document:'+job.rootId,async()=>{throwIfTaskStopped();const latest=await read('page-documents',job.rootId),head=await readOutput(latest.headOutputId),bytes=await fs.readFile(path.join(dataDir,'outputs',head.id+'.pptx')),current=await inspectNativePage(bytes,job.page);if(current.fingerprint!==inspection.fingerprint)throw Error('本页版本已变化，请查看最新效果后重新发送要求');
     const patched=await patchNativePage(bytes,job.page,operations,{allowedAssetIds:allowedAssets,fontPolicy:base.plan.styleSkillSnapshot?.fontFamily?{title:base.plan.styleSkillSnapshot.fontFamily,body:base.plan.styleSkillSnapshot.fontFamily,latin:base.plan.styleSkillSnapshot.fontFamily}:undefined});workingInspection=await inspectNativePage(patched,job.page);const out=await exportPageRevision({...head,__inspection:inspection},patched,{page:job.page,operations,rootId:job.rootId,revision:latest.revision+1,onPhase:p=>pagePhase(job,p)});latest.headOutputId=out.id;latest.revision++;await write('page-documents',job.rootId,latest);return out;
    });break;
   }catch(error){if(error.code!=='PPT_TEXT_OVERFLOW'||attempt===1)throw error;feedback=pageOverflowFeedback(error.issues,workingInspection);}
  }
  throwIfTaskStopped();job.status='done';job.phase=newOutput?'本页已修改并通过检查':'已回复本页问题';job.outputId=newOutput?.id;
 }catch(error){job.status=isTaskStopped(error)?'stopped':'failed';job.error=isTaskStopped(error)?undefined:String(error.message).split(key).join('[hidden]');job.phase=isTaskStopped(error)?'已停止，原版本保留':'本页修改未提交，原版本保留';reply=isTaskStopped(error)?'已停止本页修改，原稿和照片已保留，可重新编辑这次要求。':'本次未覆盖原稿：'+job.error;}
 finally{await recordPageJob(job);await withDocumentLock('session:'+sessionId,async()=>{const s=await read('page-sessions',sessionId);s.activeJobId=null;s.messages.push({id:randomUUID(),role:'assistant',content:reply||'本页处理已结束',jobId:job.id,status:job.status,outputId:newOutput?.id,createdAt:new Date().toISOString()});await write('page-sessions',sessionId,s);});}
}
export async function undoPageMessage(id){
 if(!sid(id))throw Error('无效的页面会话');return withDocumentLock('session:'+id,async()=>{
  const session=await read('page-sessions',id);if(session.activeJobId&&['queued','running','stopping'].includes(jobs.get(session.activeJobId)?.status))throw Error('请等待本页处理完成');
  const target=[...session.messages].reverse().find(m=>m.role==='assistant'&&m.outputId&&!m.undo&&!(session.undoneOutputs||[]).includes(m.outputId));if(!target)throw Error('本页没有可以撤回的修改');
  const job={id:randomUUID(),rootId:session.rootId,page:session.page,status:'queued',phase:'准备撤回本页修改',createdAt:new Date().toISOString()};jobs.set(job.id,job);session.activeJobId=job.id;session.messages.push({id:randomUUID(),role:'user',content:'撤回本页上一次修改，保留其他页。',createdAt:new Date().toISOString()});await write('page-sessions',id,session);
  enqueuePageJob(job,async()=>{let output,reply;try{throwIfTaskStopped();job.status='running';output=await withDocumentLock('document:'+job.rootId,async()=>{throwIfTaskStopped();const state=await read('page-documents',job.rootId),head=await readOutput(state.headOutputId),last=await readOutput(target.outputId),parent=await readOutput(last.parentOutputId),[current,lastBytes,parentBytes]=await Promise.all([fs.readFile(path.join(dataDir,'outputs',head.id+'.pptx')),fs.readFile(path.join(dataDir,'outputs',last.id+'.pptx')),fs.readFile(path.join(dataDir,'outputs',parent.id+'.pptx'))]),[a,b]=await Promise.all([inspectNativePage(current,job.page),inspectNativePage(lastBytes,job.page)]);if(a.fingerprint!==b.fingerprint)throw Error('本页素材或结构已变化，请基于当前页面继续修改');const restored=await restoreNativePage(current,parentBytes,job.page),out=await exportPageRevision(head,restored,{page:job.page,operations:[],rootId:job.rootId,revision:state.revision+1,restoreSlide:parent.plan.slides[job.page],onPhase:p=>{job.phase=p;}});state.headOutputId=out.id;state.revision++;await write('page-documents',job.rootId,state);return out;});job.status='done';job.outputId=output.id;reply='已撤回本页上一次修改，其他页保留。';}catch(error){job.status=isTaskStopped(error)?'stopped':'failed';job.error=isTaskStopped(error)?undefined:error.message;job.phase=isTaskStopped(error)?'已停止，原版本保留':'撤回未完成';reply=isTaskStopped(error)?'已停止撤回，原稿已保留。':'未覆盖原稿：'+error.message;}finally{await recordPageJob(job);await withDocumentLock('session:'+id,async()=>{const fresh=await read('page-sessions',id);fresh.activeJobId=null;if(output)fresh.undoneOutputs=[...(fresh.undoneOutputs||[]),target.outputId];fresh.messages.push({id:randomUUID(),role:'assistant',content:reply,status:job.status,outputId:output?.id,undo:true,createdAt:new Date().toISOString()});await write('page-sessions',id,fresh);});}});return {job:publicJob(job)};
 });
}
