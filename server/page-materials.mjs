import {loadPinnedPlan} from './material-analysis.mjs';
import {deckSchema} from './planner.mjs';
import {readComponents} from './components.mjs';
import {prepareEditableComponent,classifyPurpose} from './material-layouts.mjs';
import {designWithMaterials} from './designer.mjs';
import {autoCompose} from './composition.mjs';
import {resolveTemplate,settings} from './studio.mjs';
import {nativeChartMatches} from './recommendations.mjs';

export async function replacePageMaterial(body,{fetchImpl=fetch,onPhase=()=>{}}={}){
 const initialCatalog=await readComponents(),pinned=body.baseOutputId?await loadPinnedPlan(body.baseOutputId,initialCatalog.items):null;
 const plan=deckSchema.parse(pinned?{...body.plan,slides:body.plan.slides.map((s,i)=>i===Number(body.page)?s:pinned.slides[i])}:body.plan),page=Number(body.page);
 if(!Number.isInteger(page)||page<0||page>=plan.slides.length)throw new Error('页面编号无效');
 const slide=plan.slides[page],selected=initialCatalog.items.find(c=>c.id===body.componentId);
 if(!selected)throw new Error('组件不存在');
 const template=await resolveTemplate(plan.templateId);
 if(slide.chart){
  if(!nativeChartMatches(slide,selected))throw new Error('请选择与当前图号相同的原生统计图表设计');
  const changed=autoCompose({...plan,slides:[{...slide,materialId:selected.id,designReason:`原生图表：${selected.sourceName} 第 ${selected.page} 页`} ]},template,initialCatalog.items).slides[0];
  return {...plan,slides:plan.slides.map((s,i)=>i===page?changed:s)};
 }
 onPhase('分析新素材的完整结构与文字位置');
 const component=await prepareEditableComponent(body.componentId);
 const purpose=component.purpose||classifyPurpose(component.title,component.text,component.relation);
 if(slide.kind!=='agenda'&&purpose==='agenda')throw new Error('目录组件只用于目录页，请选择正文图解或主体组件');
 if(slide.kind==='content'&&purpose==='cover')throw new Error('请选择正文组件，封面组件不用于正文页');
 const catalog=await readComponents(),config=await settings();
 const revised={...slide,materialId:component.id,materialBindings:undefined,materialSnapshot:undefined,materialAnalysis:undefined,adaptation:undefined,blocks:undefined,visual:['cover','agenda'].includes(component.relation)?slide.visual:component.relation};
 const designed=await designWithMaterials({title:plan.title,slides:[revised]},catalog.items,{document:plan.sourceText||[slide.title,...slide.bullets,slide.notes].filter(Boolean).join('\n'),requirements:'使用用户选定的原生组件，重新组织本页文字；只使用所提供文档事实。',presentationPrompt:config.presentationPrompt,forcedMaterialId:component.id,onPhase,apiKey:body.apiKey,model:body.model||'deepseek-flash',mode:body.mode||'deepseek'},{fetchImpl});
 const result=autoCompose({...plan,slides:[designed.slides[0]]},template,catalog.items).slides[0];
 return {...plan,slides:plan.slides.map((s,i)=>i===page?result:s)};
}


export async function replaceAndExport(body,onPhase=()=>{}){
 if(body.mode!=='demo'){const {runHermesWorkflow}=await import('./hermes-workflow.mjs');return runHermesWorkflow(body,{onPhase});}
 const {saveComposition}=await import('./studio.mjs');return saveComposition(await replacePageMaterial(body,{onPhase}),{onPhase});
}
