import {rankMaterialLayouts} from './material-layouts.mjs';
import {analyzeMaterial} from './material-analysis.mjs';
import {inspectPreparedDesign} from './material-preflight.mjs';
import {materialIdentity} from './material-semantics.mjs';
import {loadWorkflowCheckpoint} from './workflow-checkpoints.mjs';
import {readComponents} from './components.mjs';

export function recoverablePages(snapshot){
 if(!snapshot?.plan?.slides||snapshot.status==='done')return [];
 const done=new Set(snapshot.progress?.completedPages||[]),bad=new Set([...(snapshot.progress?.failedPages||[]).map(p=>+p.page),...(snapshot.pageErrors||[]).map(([n])=>+n)]);
 return snapshot.plan.slides.flatMap((s,i)=>!done.has(i+1)||bad.has(i+1)?[{page:i+1,title:s.title,reason:snapshot.progress?.failedPages?.find(p=>+p.page===i+1)?.error||snapshot.pageErrors?.find(([n])=>+n===i+1)?.[1]?.issues?.join('；')||'页面尚未完成'}]:[]);
}
function targetPage(snapshot,page){
 const pending=recoverablePages(snapshot),number=page===undefined?pending[0]?.page:Number(page);
 if(!Number.isInteger(number)||!pending.some(p=>p.page===number))throw Error('请选择尚未完成或检查未通过的页面，已完成页面会保留');
 return number;
}
function eligibleMaterials(snapshot,page,catalog){
 const used=new Set(snapshot.plan.slides.flatMap((s,i)=>i===page-1?[]:[s.materialId,materialIdentity(s.materialSnapshot||catalog.find(c=>c.id===s.materialId))]).filter(Boolean));
 const slide=snapshot.plan.slides[page-1],options={used,referenceId:snapshot.plan.referenceId,materialScope:'full'},exact=rankMaterialLayouts(slide,catalog,options),fallback=slide.kind==='agenda'?[]:rankMaterialLayouts({...slide,visual:'text'},catalog,options),seen=new Set();
 return [...exact,...fallback].filter(({component:c})=>{if(seen.has(c.id))return false;seen.add(c.id);return true;});
}
export async function buildRecoveryView(snapshot,{page,query='',catalog,template,analyze=analyzeMaterial,limit=10}={}){
 const number=targetPage(snapshot,page),slide=snapshot.plan.slides[number-1],ranked=eligibleMaterials(snapshot,number,catalog),search=String(query).trim().toLowerCase();
 const matching=ranked.filter(({component:c})=>!search||[c.id,c.sourceName,c.title,String(c.page)].join(' ').toLowerCase().includes(search)),items=[];
 for(const {component:c,tagMatch}of matching.slice(0,Math.min(16,Math.max(1,limit)))){
  try{const snapshot=await analyze(c),check=inspectPreparedDesign(slide,snapshot,template,{allowSoftGeometry:true});items.push({id:c.id,title:c.title,sourceName:c.sourceName,sourcePage:c.page,previewUrl:`/api/previews/${c.sourceId}/${c.page}.png`,selectable:check.selectable,recipe:check.recipe,usage:check.usage,warnings:check.warnings||[],reason:check.reason||tagMatch?.reasons?.slice(0,2).join(' · ')||'保留原生图形，按本页主题重新填写',slots:snapshot.slots.filter(s=>!s.decorative&&!s.fixed).length});}
  catch{items.push({id:c.id,title:c.title,sourceName:c.sourceName,sourcePage:c.page,selectable:false,reason:'素材结构或资源暂不可用，请选择其他设计'});}
 }
 const failedPages=recoverablePages(snapshot),pending=new Set(failedPages.map(p=>p.page));
 return {id:snapshot.id,revision:snapshot.updatedAt,status:snapshot.status,page:{number,title:slide.title,kind:slide.kind,bullets:slide.bullets},failedPages,completedPages:(snapshot.progress?.completedPages||[]).filter(n=>!pending.has(n)),totalPages:snapshot.plan.slides.length,items,total:matching.length,selected:slide.manualDesign||null,note:items.length?'':'暂未找到项目数与页面用途匹配的素材，可更换检索词或导入对应素材。'};
}
export async function applyManualDesign(snapshot,selection,{catalog,template,analyze=analyzeMaterial,now=()=>new Date().toISOString()}={}){
 if(snapshot.status==='running')throw Error('任务仍在运行，请等待当前处理完成');
 if(selection.revision&&selection.revision!==snapshot.updatedAt)throw Error('制作进度已更新，请刷新右侧设计列表后重选');
 const number=targetPage(snapshot,selection.page),found=eligibleMaterials(snapshot,number,catalog).find(({component:c})=>c.id===selection.materialId);
 if(!found)throw Error('素材与页面用途、模块数不匹配，或已用于其他页面，请选择当前推荐中的设计');
 if(selection.recipe&&!['auto','visual','reflow'].includes(selection.recipe))throw Error('无效的重排方式');
 const c=await analyze(found.component),slide=snapshot.plan.slides[number-1];
 if(selection.recipe==='reflow'&&!c.geometry?.reflowSafe)throw Error('该素材不能安全拆分重排，请选择其他方式');
 const check=inspectPreparedDesign(slide,c,template,{recipe:selection.recipe||'auto',allowSoftGeometry:true});if(!check.selectable)throw Error(check.reason);
 const next=structuredClone(snapshot),target=next.plan.slides[number-1];
 for(const key of ['materialBindings','materialAnalysis','adaptation','blocks','contentReview','visualSelection','nativeEdits'])delete target[key];
 target.materialId=c.id;target.materialSnapshot=c;target.layoutRecipe=check.recipe;
 target.manualDesign={materialId:c.id,recipe:check.recipe,source:'manual-selection',selectedAt:now(),warnings:check.warnings||[]};
 target.visualSelection={mode:'manual-selection',sourceName:c.sourceName,sourcePage:c.page,selectedMaterialId:c.id,reason:'通过失败页选版入口确认素材后继续制作',copyGuidance:'按当前主题重新填写，不修改人工选定素材或其他已完成页。'};
 if(next.draftBindings)delete next.draftBindings[number];
 next.pageErrors=(next.pageErrors||[]).filter(([n])=>+n!==number);
 next.progress={...next.progress,completedPages:(next.progress?.completedPages||[]).filter(n=>n!==number),failedPages:(next.progress?.failedPages||[]).filter(p=>+p.page!==number),activePages:[]};
 next.error=undefined;next.resumable=true;next.phase=`已选择第 ${number} 页设计，准备继续`;return next;
}
export async function getWorkflowRecovery(id,options={}){
 const snapshot=await loadWorkflowCheckpoint(id);if(!snapshot)throw Error('未找到制作断点');
 const {resolveTemplate}=await import('./studio.mjs'),catalog=await readComponents(),template=await resolveTemplate(snapshot.plan?.templateId);
 return buildRecoveryView(snapshot,{...options,catalog:catalog.items,template});
}
