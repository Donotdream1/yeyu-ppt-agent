import {workspaceLibrary} from './workspace-library.mjs';
import {applyDesignProfile} from './design-profile.mjs';
import {duplicateMaterialPages} from './material-semantics.mjs';
import {RESEARCH_PROFILE} from './research-profile.mjs';
import {reviewWithHarness} from './harness-review.mjs';
import {fitNativeText} from './native-text-fit.mjs';
import fs from 'node:fs/promises';
import {currentGenerationQuota} from './generation-quota.mjs';
import path from 'node:path';
import JSZip from 'jszip';
import {randomUUID} from 'node:crypto';
import {dataDir,readLibrary,update,sourceBuffer} from './library.mjs';
import {readComponents} from './components.mjs';
import {requestSchema,deckSchema,planDeck} from './planner.mjs';
import {autoCompose,composeDeck} from './composition.mjs';
import {designWithMaterials} from './designer.mjs';
import {ensureVisualCoverage} from './content-coverage.mjs';
import {prepareChart,chartForDeck,CHART_RULES} from './charts.mjs';
import {renderPowerPoint,renderStates} from './render.mjs';
import {loadWorkflowCheckpoint,publicWorkflowJob,saveWorkflowCheckpoint} from './workflow-checkpoints.mjs';
import {applyManualDesign} from './workflow-recovery.mjs';
import {withHermesRuntimeRecovery} from './hermes-recovery.mjs';
import {createTaskControl,runWithTaskControl,releaseTaskControl,requestTaskStop,taskControlState,throwIfTaskStopped,isTaskStopped,sealTaskCommit} from './task-control.mjs';

export const jobs=new Map();
export async function resolveTemplate(id){const db=await readLibrary(),template=(db.templates||[]).find(t=>t.id===(id||db.activeTemplateId));if(!template&&/^layout-[a-f0-9-]{36}$/i.test(id||'')){try{return JSON.parse(await fs.readFile(path.join(dataDir,'native-layouts',id+'.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}if(!template)throw new Error('请先上传并选择用户的输出模板 PPT');return {...template,theme:{...template.theme,font:'微软雅黑'}};}
export async function settings(){const db=await readLibrary();return {presentationPrompt:db.presentationPrompt||'',presentationPromptSource:db.presentationPromptSource||null,referenceId:db.activeReferenceId||'',references:db.sources.filter(s=>s.role==='reference'),templates:(db.templates||[]).map(t=>({...t,theme:{...t.theme,font:'微软雅黑'}})),activeTemplateId:db.activeTemplateId||'',chartPrompt:db.chartPrompt||CHART_RULES,chartPromptSource:db.chartPromptSource||null};}
export async function setChartPrompt(prompt,source){if(typeof prompt!=='string'||prompt.length>25000)throw new Error('图表提示词应在 25000 字以内');await update(db=>{db.chartPrompt=prompt;db.chartPromptSource=source||{name:'用户编辑',updatedAt:new Date().toISOString()};});}
export async function setPresentationPrompt(prompt){if(typeof prompt!=='string'||prompt.length>40000)throw new Error('生成规范应在 40000 字以内');await update(db=>{db.presentationPrompt=prompt;db.presentationPromptSource={name:'用户编辑的汇报与设计规范',updatedAt:new Date().toISOString()};});}
export async function makeComposition(body,onPhase=()=>{},onPlan=()=>{},execution={}){
  if(body.styleSkillSnapshot?.nativeTemplate){const {runNativeLayoutWorkflow}=await import('./native-layout-workflow.mjs');const output=await runNativeLayoutWorkflow(body,{onPhase,onPlan,...execution});return {...output.plan,__hermesOutput:output};}
  if(body.mode!=='demo'){const {runHermesWorkflow}=await import('./hermes-workflow.mjs');const output=await runHermesWorkflow(body,{onPhase,onPlan,...execution});return {...output.plan,__hermesOutput:output};}
  const input=requestSchema.parse(body),template=await resolveTemplate(input.templateId),config=await settings();
  input.chartPrompt=input.chartPrompt||config.chartPrompt;
  input.presentationPrompt=input.presentationPrompt||config.presentationPrompt;
  input.referenceId=input.referenceId||config.referenceId;
  let plan=ensureVisualCoverage(await planDeck(input),input.document,input);const catalog=await readComponents();onPhase(`已规划 ${plan.slides.length} 页，正在选择完整图解并撰写节点与表格文案`);
  for(const slide of plan.slides)if(slide.chart)slide.chart=prepareChart(slide.chart,input.document,input.sourceName);
  plan=await designWithMaterials(plan,catalog.items,{...input,onPhase});
  const composition=autoCompose({...plan,referenceId:input.referenceId,layoutDensity:input.layoutDensity,materialScope:input.materialScope},template,catalog.items);
  return {...composition,sourceText:input.document,sourceName:input.sourceName,sourceProvenance:input.sourceProvenance,inputProfiles:input.sourceProfiles,pageDecision:input.pageCount?`按要求生成 ${input.pageCount} 页`:`根据文档结构自动规划 ${plan.slides.length} 页`,engine:plan.engine};
}
function csv(data){const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';const keys=['x','series','value','axis','unit','mark','row','source_rows','sourceQuote'];return '\uFEFF'+keys.map(quote).join(',')+'\n'+data.records.map(r=>keys.map(k=>quote(r[k])).join(',')).join('\n');}
export async function saveComposition(body,{onPhase=()=>{},requireNativeCheck=false}={}){
  throwIfTaskStopped();const repeated=duplicateMaterialPages(body.slides||[]);if(repeated.length)throw Error(repeated.join('；'));
  const plan=deckSchema.parse(body),baseTemplate=await resolveTemplate(plan.templateId),design=await applyDesignProfile(plan,baseTemplate),template=design.template,catalog=await readComponents();plan.palette=design.palette;
  if(!plan.slides.every(s=>s.blocks?.length))throw new Error('该大纲尚未自动编排，请重新生成或执行自动编排');
  for(const slide of plan.slides)for(const block of slide.blocks)if(block.chart)block.chart=prepareChart(block.chart,plan.sourceText||'',plan.sourceName||'用户文档');
  const out=await composeDeck(plan,template,catalog.items,{chartRenderer:chartForDeck}),id=randomUUID(),bundle=new JSZip();
  const folder=path.join(dataDir,'outputs',id);await fs.mkdir(folder,{recursive:true});
  throwIfTaskStopped();onPhase('PowerPoint 正在按素材原字号检查文字边界，溢出时仅精简文案');
  const fitted=await fitNativeText(out.buffer,folder,{audit:out.audit});throwIfTaskStopped();out.buffer=fitted.buffer;out.warnings.push(...fitted.warnings);
  if(requireNativeCheck&&fitted.status!=='checked'){const error=Error('尚未完成PowerPoint原生文字检查，稿件保留为断点，请确认Office可用后继续');error.code='OFFICE_UNAVAILABLE';throw error;}
  if(plan.designProfile==='research-defense'){const minimum=name=>/Research:(chapter|main-title):/.test(name)?32:/Research:section:/.test(name)?21:/Research:viewpoint:/.test(name)?16:/Research:(module-title|layer-title):/.test(name)?17:/Research:conclusion:/.test(name)?15:/Research:(supplement|evidence):/.test(name)?12:/Research:(body|figure-caption):/.test(name)?14:0;const issues=fitted.corrections.filter(c=>c.size<minimum(c.name||''));if(issues.length){const error=new Error('科研必要内容不能依靠小字，请精简相应字段或调整版式：'+issues.map(c=>`第 ${c.page} 页 ${c.name}「${c.text}」`).join('；'));error.issues=issues;throw error;}}
  const pptxName=plan.title.replace(/[<>:"/\\|?*]/g,'_')+'.pptx';bundle.file(pptxName,out.buffer);
  const chartFiles=[];
  for(const [i,chart] of out.charts.entries()){
    const prefix=`${chart.code}_${i+1}_${(chart.title||'图表').replace(/[<>:"/\\|?*]/g,'_')}`;
    const entries={'chart_data.json':JSON.stringify(chart.data,null,2),'chart_data.csv':csv(chart.data),'data_quality.json':JSON.stringify({status:chart.data.status,issues:chart.data.issues,warnings:chart.data.warnings,is_simulated:chart.data.is_simulated},null,2),'field_map.json':JSON.stringify({grain:chart.data.grain,unit:chart.data.unit,aggregation:chart.data.aggregation,measureType:chart.data.measureType,source:chart.data.source},null,2),'profile.json':JSON.stringify({source_profiles:plan.inputProfiles||[],fields:['x','series','value','unit','axis','mark','sourceQuote'].map(name=>({name,missing:chart.data.records.filter(r=>r[name]===null||r[name]===undefined||r[name]==='').length,unique:new Set(chart.data.records.map(r=>String(r[name]))).size})),records:chart.data.records.length,series:[...new Set(chart.data.records.map(r=>r.series))],missing:chart.data.records.filter(r=>r.value===null).length},null,2)};
    if(chart.svg)entries['chart.svg']=chart.svg;if(chart.png)entries['chart.png']=chart.png;
    for(const [suffix,value] of Object.entries(entries)){const name=prefix+'_'+suffix;bundle.file('charts/'+name,value);await fs.writeFile(path.join(folder,name),value);}
    chartFiles.push({code:chart.code,title:chart.title||chart.data.title,status:chart.data.status,page:chart.page,svg:chart.svg?`/api/output-assets/${id}/${encodeURIComponent(prefix+'_chart.svg')}`:null,png:chart.png?`/api/output-assets/${id}/${encodeURIComponent(prefix+'_chart.png')}`:null,data:`/api/output-assets/${id}/${encodeURIComponent(prefix+'_chart_data.json')}`,issues:chart.data.issues});
  }
  const pagePlan={title:plan.title,designProfile:plan.designProfile,pages:plan.slides.map((s,i)=>({page:i+1,title:s.title,bullets:s.bullets,research:s.research,layout:s.research?.layout||s.layoutRecipe}))};
  const parameters={profile:plan.designProfile||'material',bnaProfile:template.bnaProfile,...(plan.designProfile==='research-defense'?RESEARCH_PROFILE:{}),styleParameters:plan.styleSkillSnapshot?.parameters,typography:{fontFamily:plan.styleSkillSnapshot?.fontFamily||plan.styleSkillSnapshot?.fontPolicy?.body||'微软雅黑',fontPolicy:plan.styleSkillSnapshot?.fontPolicy,sourceFonts:plan.styleSkillSnapshot?.parameters?.fonts,referenceLayout:plan.styleSkillSnapshot?.nativeTemplate?{name:plan.styleSkillSnapshot.nativeTemplate.name,native:true,preserveGeometry:true}:undefined,nativeFontSizes:'preserve-source',overflowPolicy:'compress-copy-or-change-material',autoShrink:false},styleDecision:plan.styleDecision,palette:plan.palette,canvasEmu:{width:template.width,height:template.height},actualTextFit:{status:fitted.status,corrections:fitted.corrections}};
  const harnessReport=plan.harnessReview?await reviewWithHarness(plan,{textFit:fitted.status}):null;
  if(plan.styleSkillSnapshot?.content){bundle.file('generation-prompt.md',plan.styleSkillSnapshot.content);await fs.writeFile(path.join(folder,'generation-prompt.md'),plan.styleSkillSnapshot.content);}
  bundle.file('page-plan.json',JSON.stringify(pagePlan,null,2));bundle.file('design-parameters.json',JSON.stringify(parameters,null,2));if(harnessReport)bundle.file('harness-review.json',JSON.stringify(harnessReport,null,2));
  await fs.writeFile(path.join(folder,'page-plan.json'),JSON.stringify(pagePlan,null,2));await fs.writeFile(path.join(folder,'design-parameters.json'),JSON.stringify(parameters,null,2));if(harnessReport)await fs.writeFile(path.join(folder,'harness-review.json'),JSON.stringify(harnessReport,null,2));
  const report={template:{id:template.id,name:template.name,width:template.width,height:template.height},pages:plan.slides.map((s,i)=>({page:i+1,title:s.title,visual:s.visual,templatePage:s.templatePage,components:s.blocks.filter(b=>b.type==='component').map(b=>b.componentId)})),components:out.audit,pageEdits:out.chromeChanges||[],warnings:[...(plan.designWarnings||[]),...out.warnings],charts:chartFiles};
  bundle.file('composition.json',JSON.stringify(report,null,2));await fs.writeFile(path.join(dataDir,'outputs',id+'.pptx'),out.buffer);await fs.writeFile(path.join(dataDir,'outputs',id+'.zip'),await bundle.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  const info={id,title:plan.title,pages:plan.slides.length,url:`/api/files/${id}.pptx`,bundleUrl:`/api/bundles/${id}`,template:report.template,charts:chartFiles,warnings:out.warnings,textFit:{status:fitted.status,corrections:fitted.corrections},audit:report.components,pageEdits:report.pageEdits,createdAt:new Date().toISOString(),plan,promptUrl:plan.styleSkillSnapshot?.content?`/api/output-assets/${id}/generation-prompt.md`:undefined,parametersUrl:`/api/output-assets/${id}/design-parameters.json`,pagePlanUrl:`/api/output-assets/${id}/page-plan.json`,harnessReviewUrl:harnessReport?`/api/output-assets/${id}/harness-review.json`:undefined};
  throwIfTaskStopped();
  const renderJob=renderPowerPoint(path.join(dataDir,'outputs',id+'.pptx'),path.join(dataDir,'previews',id),id);
  if(requireNativeCheck||plan.designProfile==='research-defense'||template.bnaProfile){onPhase('正在导出全页预览、设计参数表与审查报告');await renderJob;const previewDir=path.join(dataDir,'previews',id),files=await fs.readdir(previewDir).catch(()=>[]);if(requireNativeCheck&&(renderStates.get(id)?.status!=='ready'||files.filter(n=>/^\d+\.png$/.test(n)).length!==plan.slides.length))throw Error('PowerPoint全页预览尚未完成，制作进度已保存，请确认Office可用后继续');for(const name of files.filter(n=>/^\d+\.png$/.test(n)))bundle.file('previews/'+name,await fs.readFile(path.join(previewDir,name)));bundle.file('previews/index.html','<!doctype html><meta charset="utf-8"><title>全页预览</title><style>body{background:#eef1f6;margin:30px}img{display:block;max-width:1200px;width:100%;margin:20px auto}</style>'+plan.slides.map((s,i)=>`<img src="${i+1}.png" alt="第${i+1}页">`).join(''));info.render=renderStates.get(id);await fs.writeFile(path.join(dataDir,'outputs',id+'.zip'),await bundle.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));}
  sealTaskCommit();await fs.writeFile(path.join(dataDir,'outputs',id+'.json'),JSON.stringify(info,null,2));return info;
}
export function startGeneration(body,{checkpointId,initial}={}){
  const quota=currentGenerationQuota();const id=checkpointId||quota?.ticket||randomUUID();jobs.set(id,{...publicWorkflowJob(initial),id,status:'running',error:undefined,checkpointId:id,resumable:false,phase:'规划页面与改写内容',createdAt:initial?.createdAt||new Date().toISOString()});
  const patch=values=>jobs.set(id,{...jobs.get(id),...values,...(!['done','failed','stopped'].includes(values.status)&&taskControlState(id)?.status==='stopping'?{status:'stopping',phase:'正在停止，等待当前操作安全结束'}:{}),id});
 const control=createTaskControl(id,{onStop:()=>patch({status:'stopping',phase:'正在停止，等待当前操作安全结束'})});
  void runWithTaskControl(control,async()=>{try{throwIfTaskStopped();const plan=await makeComposition(body,phase=>patch({status:'running',phase}),outline=>patch({status:'running',phase:'逐页方案已就绪，正在制作原生PPT',plan:outline}),{checkpointId:id,resumeCheckpoint:initial,onProgress:progress=>patch({progress})});throwIfTaskStopped();if(plan.__hermesOutput?.styleOnly){sealTaskCommit();await quota?.finish();patch({status:'done',resumable:false,phase:'风格与配色识别已完成',output:plan.__hermesOutput});return;}if(plan.__hermesOutput?.planningOnly){sealTaskCommit();await quota?.finish();patch({status:'done',resumable:false,phase:'逐页方案已就绪，等待确认后制作',output:plan.__hermesOutput});return;}patch({status:'running',phase:`已规划 ${plan.slides.length} 页，正在重组元素并套用用户模板`});const output=plan.__hermesOutput||await saveComposition(plan,{onPhase:phase=>patch({phase})});sealTaskCommit();await workspaceLibrary.attachKnownJobOutput(id,output);await quota?.finish(output);patch({status:'done',resumable:false,phase:'PPTX 与预览已就绪',output});}catch(e){if(isTaskStopped(e)){const previous=await loadWorkflowCheckpoint(id);await saveWorkflowCheckpoint(id,{...previous,body:previous?.body||body,status:'stopped',phase:'已停止，进度已保存',error:undefined,resumable:true,progress:e.progress||previous?.progress||jobs.get(id)?.progress});await quota?.finish();patch({status:'stopped',phase:'已停止，进度已保存',error:undefined,resumable:true,progress:e.progress||previous?.progress||jobs.get(id)?.progress});return;}await quota?.finish();patch({status:'failed',phase:'本轮未完成，已保留制作进度',error:e.message,resumable:Boolean(e.resumable),checkpointId:e.checkpointId||id,...(e.progress?{progress:e.progress}:{})});}finally{releaseTaskControl(control);}});return {id};
}
export async function getGenerationJob(id){
 if(jobs.has(id))return withHermesRuntimeRecovery(jobs.get(id));
 const checkpoint=await loadWorkflowCheckpoint(id);if(!checkpoint)return null;
 const publicJob=publicWorkflowJob(checkpoint);
 if(['running','stopping'].includes(publicJob.status))Object.assign(publicJob,{status:'failed',phase:'任务已中断，可从已保存页面继续',resumable:true});
 return withHermesRuntimeRecovery(publicJob);
}
export async function stopGeneration(id){
 const stopping=await requestTaskStop(id);if(stopping)return stopping;
 const job=await getGenerationJob(id);if(!job)throw Object.assign(Error('任务不存在'),{status:404});
 if(['done','failed','stopped'].includes(job.status))return {id,status:job.status};
 throw Object.assign(Error('当前任务没有可中断的运行进程，请刷新后重试'),{status:409});
}
const resumeClaims=new Set();
export async function resumeGeneration(id,{apiKey,manualSelection}={}){
 if(resumeClaims.has(id)||taskControlState(id)||['running','stopping'].includes(jobs.get(id)?.status))throw Error('该任务仍在运行或已经开始恢复，请等待当前执行结束');
 resumeClaims.add(id);
 try{
  let checkpoint=await loadWorkflowCheckpoint(id);if(!checkpoint)throw Error('该任务没有可恢复的制作断点，请使用现有大纲重新生成');
  if(checkpoint.status==='done')throw Error('该任务已完成，请下载已生成的PPT');
  if(manualSelection){
   const catalog=await readComponents(),template=await resolveTemplate(checkpoint.plan?.templateId);
   checkpoint=await applyManualDesign({...checkpoint,status:'failed'},manualSelection,{catalog:catalog.items,template});
   await saveWorkflowCheckpoint(id,checkpoint);
  }
  return startGeneration({...checkpoint.body,...(apiKey?{apiKey}:{})},{checkpointId:id,initial:checkpoint});
 }finally{resumeClaims.delete(id);}
}
