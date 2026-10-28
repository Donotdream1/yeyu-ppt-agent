import {analyzeMaterial} from './material-analysis.mjs';
import {rankMaterialLayouts} from './material-layouts.mjs';
import {composeHermesSlide} from './page-layout.mjs';
import {materialIdentity} from './material-semantics.mjs';
import {contentSlots} from './source-captions.mjs';

export function inspectPreparedDesign(slide,snapshot,template,{recipe='auto',allowSoftGeometry=false}={}){
 if(!snapshot?.slots?.length||!contentSlots(snapshot).length||snapshot.nativeObjects<=0||snapshot.slots.length>128)return {selectable:false,reason:'素材没有可绑定的正文位置或位置过多'};
 const body=template.bnaProfile?.bodyArea,probeTemplate=body?{...template,safeArea:{x:body.x,y:body.y-.11,w:body.w,h:body.h+.11}}:template;
 const bindings=snapshot.slots.map(s=>({slot:s.index,key:s.key,text:s.fixed||'预检',contentIds:(slide.bullets||[]).map((_,i)=>'u'+(i+1))}));
 const probe=layoutRecipe=>composeHermesSlide({...slide,materialSnapshot:snapshot,materialBindings:bindings,layoutRecipe,adaptation:{status:'checked'}},0,probeTemplate);
 const soft=r=>Boolean(template.bnaProfile&&(r.materialUsage.width<.9||r.materialUsage.height<(slide.kind==='agenda'?.45:.9)));
 let out=probe(recipe),report=out.layoutReview;
 if(recipe==='auto'&&snapshot.geometry?.reflowSafe&&out.layoutRecipe!=='reflow'&&(report.materialUsage.area<.45||soft(report))){const alternative=probe('reflow');if(alternative.layoutReview.materialUsage.area>report.materialUsage.area||!soft(alternative.layoutReview))out=alternative;report=out.layoutReview;}
 const usage=report.materialUsage;
 if(report.sourceObjects!==report.retainedObjects||!Number.isFinite(usage.area)||usage.area<.45)return {selectable:false,reason:report.sourceObjects!==report.retainedObjects?'重排会遗漏原生对象':'素材主体占比不足',usage};
 const warning=soft(report)?'素材纵横比无法充分利用标题下方区域，将保留其完整比例':null;
 if(warning&&!allowSoftGeometry)return {selectable:false,reason:warning,usage};
 return {selectable:true,recipe:out.layoutRecipe,usage,warnings:warning?[warning]:[],layout:{layoutRecipe:out.layoutRecipe,layoutReview:report}};
}

// Geometry preflight is deterministic and does not consume model tool rounds.
// Probe bindings exist only inside this function and are never returned as copy.
export async function selectPreparedMaterial(slide,components,{template,referenceId='',used=new Set(),analyze=analyzeMaterial,excludeIds=[]}={}){
 if(!template?.width||!template?.height)throw new Error('素材预检需要有效的用户模板画布');
 if(template.bnaProfile&&slide.kind==='cover')return {component:null,layout:{layoutRecipe:'native-template-cover',nativeTemplateCover:true,templatePage:template.bnaProfile.coverPage||1},diagnostics:[]};
 const exclusions=new Set(excludeIds),diagnostics=[];
 const ranked=rankMaterialLayouts(slide,components,{referenceId,used,materialScope:'full'}).filter(({component:c})=>!exclusions.has(c.id)).slice(0,8);
 const body=template.bnaProfile?.bodyArea;
 const probeTemplate=body?{...template,safeArea:{x:body.x,y:body.y-.11,w:body.w,h:body.h+.11}}:template;
 const unitIds=(slide.bullets||[]).map((_,i)=>'u'+(i+1));
 for(const {component:c,score,tagMatch} of ranked){
  try{
   const snapshot=await analyze(c);
   if(!snapshot?.slots?.length||!contentSlots(snapshot).length||snapshot.nativeObjects<=0||snapshot.slots.length>128){diagnostics.push({materialId:c.id,status:'rejected',reason:'素材没有可绑定的正文位置或位置过多'});continue;}
   const checked=inspectPreparedDesign(slide,snapshot,template),usage=checked.usage;
   if(!checked.selectable){diagnostics.push({materialId:c.id,status:'rejected',reason:checked.reason,usage,score});continue;}
   diagnostics.push({materialId:c.id,status:'selected',usage,score,recipe:checked.recipe});
   used.add(snapshot.id);used.add(materialIdentity(snapshot));if(snapshot.familyId)used.add(snapshot.familyId);
   return {component:snapshot,layout:checked.layout,diagnostics,tagMatch};
  }catch(error){diagnostics.push({materialId:c.id,status:'rejected',reason:error.message,score});}
 }
 return {component:null,layout:null,diagnostics};
}
