import {visibleNodeBounds} from './material-geometry.mjs';
import {openZip,slideOrder,parse,elements,first} from './ooxml.mjs';
import {readLibrary,sourceBuffer} from './library.mjs';
import {drawingNodes,nodeBounds,unionBounds,saveComponents,readComponents,componentNodes,absoluteNodeBounds} from './components.mjs';
import {isDecorativeSourceSlot,contentSlots} from './source-captions.mjs';
import {slideTagRequirements,matchPageTags} from './material-tags.mjs';
import {agendaItemCount,materialIdentity} from './material-semantics.mjs';

export const editableTextTargets=(node,{legacy=false}={})=>elements(node,'txBody').map(t=>t.parentNode).filter(n=>['sp','tc'].includes(n.localName)&&(elements(n,'t').some(t=>t.textContent.trim())||(!legacy&&(n.localName==='tc'||first(n,'cNvSpPr')?.getAttribute('txBox')==='1'||first(n,'ph')))));
const textOf=n=>elements(n,'t').map(t=>t.textContent).join('');
const words=s=>new Set(String(s).toLowerCase().match(/[\u4e00-\u9fff]{2}|[a-z]{3,}/g)||[]);
export function classifyPurpose(title,text='',relation=''){
 if(relation==='cover')return 'cover';
 if(/购买须知|产品说明|好评回馈|版权保护|常见问题|500页汇报PPT模版/.test(title))return 'instruction';
 if(relation==='agenda'||/目录|\bCONTENTS?\b|\bAGENDA\b|章节导航|内容概览/i.test(title+' '+text.slice(0,120)))return 'agenda';
 if(/^(?:完整组合 · |主体组件 · )?(?:\d{4}年度|\d{4}年终汇报)$/.test(title))return 'cover';
 if(/谢谢(?:观看|聆听)?|感谢(?:观看|聆听)|\bTHANKS?\b|感谢您的/i.test(title))return 'ending';
 return 'content';
}
export function inferLayoutRelation(title,text){
 const s=title+' '+text.slice(0,160);
 if(/并列关系|图文排版|工作成果展示/.test(title))return 'parallel';
 if(/包含关系|层级关系/.test(title))return 'hierarchy';
 if(/递进关系|生产研发流程/.test(title))return 'process';
 if(/总体判断|核心经验|总结|核心观点/.test(title))return 'parallel';
 if(/目录|CONTENT/i.test(title))return 'agenda';
 if(/闭环|循环|再部署|持续优化/.test(title))return 'cycle';
 if(/历程|时间|推广与|发展阶段|里程碑/.test(title))return 'timeline';
 if(/概览|责任与|协作接口|效益分享|清单|矩阵/.test(title))return 'matrix';
 if(/分离|架构|平台.*模型|模型.*平台|技术底座/.test(title))return 'architecture';
 if(/四方.*实践|协同实践|核心.*关系|必要性|联动/.test(title))return 'hub';
 if(/职责|分工|业主|责任|组织|运营机制/.test(title))return 'responsibility';
 if(/流程|运行机制|步骤|路径|生产|协同运行/.test(s))return 'process';
 if(/对比|比较|优势.*劣势|VS/i.test(title))return 'compare';
 if(/层级|金字塔|层次/.test(title))return 'hierarchy';
 return 'parallel';
}
export async function indexMaterialLayouts(sourceId,{reference=false,force=false}={}){
 const existing=await readComponents();if(existing.layoutVersions?.[sourceId]===12&&!force)return {sourceId,duplicate:true,count:existing.items.filter(c=>c.layout&&c.sourceId===sourceId).length};
 const lib=await readLibrary(),source=lib.sources.find(s=>s.id===sourceId);if(!source)throw new Error('找不到素材源');
 const z=await openZip(await sourceBuffer(sourceId)),order=await slideOrder(z),layouts=[];
 for(let page=0;page<order.paths.length;page++){
  const part=order.paths[page],doc=parse(await z.file(part).async('string')),nodes=drawingNodes(doc),asset=lib.assets.find(a=>a.sourceId===sourceId&&a.page===page+1),pageText=elements(doc,'t').map(n=>n.textContent).join(' '),title=asset?.title||pageText.slice(0,35);
  if(/终于等到|加我微信|微信号|购买须知|免责声明|版权声明|使用说明/.test(title+' '+pageText.slice(0,100)))continue;
  const cover=asset?.kind==='cover'||classifyPurpose(title,pageText)==='cover'||(page===0&&source.slides<60&&!/目录/.test(title));
  const selected=nodes.map((n,i)=>({n,i,b:visibleNodeBounds(n),text:textOf(n)})).filter(({n,b,text})=>{
   if(!b||b.w<=0||b.h<=0)return false;
   if(cover)return b.x>=-order.width*.02&&b.y>=0&&b.x+b.w<order.width*1.2&&b.y+b.h<order.height*1.2&&(b.w<order.width*.99||b.h<order.height*.99);
   if(!text&&(b.x<-order.width*.05||b.y<-order.height*.05||b.x+b.w>order.width*1.05||b.y+b.h>order.height*1.05))return false;
   // Keep complete body objects, including their grouped arrows and decorations.
   // Exclude the source header, footer and full-slide background, never rasterize.
   // Preserve top/bottom content objects; native diagrams are not cropped by page bands.
   if(['sp','pic'].includes(n.localName)&&!text.trim()&&b.w>order.width*.96&&b.h>order.height*.92)return false;
   if(n.localName==='sp'&&text===title&&b.y<order.height*.14)return false; // replaced by the output page title
   // Small labels above diagrams remain editable content.
   if(b.x+b.w<0||b.x>order.width||b.y+b.h<0)return false;
   return true;
  });
  if(selected.length<3&&!selected.some(v=>first(v.n,'tbl')))continue;
  const targets=selected.flatMap(v=>editableTextTargets(v.n)),allText=targets.map(textOf).join(' ');
  if(targets.length<3||targets.length>128||allText.length<12)continue;
  const bounds=unionBounds(selected.map(v=>v.b));if(!bounds||bounds.w<order.width*.35||bounds.h<order.height*.18)continue;
  const hasChart=selected.some(v=>first(v.n,'chart')),hasSmartart=selected.some(v=>first(v.n,'relIds')),hasOle=selected.some(v=>first(v.n,'oleObj'));
  if(hasChart||hasSmartart||hasOle)continue; // these keep their separate validated data-binding path
  const slots=describeTextSlots(targets,order);
  const table=selected.some(v=>first(v.n,'tbl')),relation=cover?'cover':table?'matrix':inferLayoutRelation(title,allText);
  layouts.push({scope:'full',familyId:`${sourceId}-${page+1}`,purpose:classifyPurpose(title,pageText,relation),id:`${sourceId}-${page+1}-layout`,sourceId,sourceName:source.name,part,page:page+1,nodeIndices:selected.map(v=>v.i),bounds,width:order.width,height:order.height,type:'diagram',layout:true,reference:reference||source.role==='reference',title:'完整组合 · '+title,tags:['完整组合',relation,title],relation,editable:true,textSlots:slots.length,slots,text:allText.slice(0,700),nativeObjects:selected.reduce((s,v)=>s+elements(v.n,'cNvPr').length,0),dataKinds:table?['table']:[],dataRisk:table,tableBinding:table,thumbnail:`/api/components/${sourceId}-${page+1}-layout/preview?v=12`});
  const full=layouts.at(-1);
  if(full.purpose==='content'&&!table){
   const graphics=selected.filter(v=>v.n.localName==='grpSp'||!v.text.trim());
   const focus=unionBounds(graphics.map(v=>v.b).filter(b=>b.w>order.width*.02&&b.h>order.height*.015&&!(b.w>order.width*.94&&b.h>order.height*.7)));
   if(focus&&focus.w>order.width*.28&&focus.h>order.height*.12){
    const padX=order.width*.012,padY=order.height*.015;
    const core=selected.filter(v=>graphics.includes(v)||(v.b.x+v.b.w/2>=focus.x-padX&&v.b.x+v.b.w/2<=focus.x+focus.w+padX&&v.b.y+v.b.h/2>=focus.y-padY&&v.b.y+v.b.h/2<=focus.y+focus.h+padY));
    const coreBounds=unionBounds(core.map(v=>v.b)),coreTargets=core.flatMap(v=>editableTextTargets(v.n));
    if(core.length<selected.length&&coreTargets.length>=3&&coreBounds&&(coreBounds.h<bounds.h*.92||coreBounds.w<bounds.w*.92)){
     const id=full.id+'-core';layouts.push({...full,id,scope:'core',title:'主体组件 · '+title,nodeIndices:core.map(v=>v.i),bounds:coreBounds,text:coreTargets.map(textOf).join(' ').slice(0,700),slots:describeTextSlots(coreTargets,order),textSlots:coreTargets.length,nativeObjects:core.reduce((n,v)=>n+elements(v.n,'cNvPr').length,0),thumbnail:`/api/components/${id}/preview?v=12`});
    }
   }
  }
 }
 await saveComponents(db=>{db.items=db.items.filter(c=>!(c.sourceId===sourceId&&c.layout));db.items.push(...layouts);db.layoutVersions={...db.layoutVersions,[sourceId]:12};});
 return {sourceId,count:layouts.length,duplicate:false};
}
export function autoMaterialSuitable(slide,c){
 const text=[slide.title,slide.subtitle,...(slide.bullets||[])].filter(Boolean).join(' '),units=slide.bullets?.length||1,capacity=Math.max(20,units*5+5,Math.ceil(text.length/14));
 if(contentSlots(c).filter(s=>!s.fixed).length>capacity)return false;
 if(/甘特|gantt/i.test(c.title||'')&&slide.visual!=='timeline'&&!/甘特|工期|进度计划/.test(text))return false;
 return true;
}
export function rankMaterialLayouts(slide,components,{referenceId='',used=new Set(),materialScope='full'}={}){
 const query=words([slide.title,slide.subtitle,...slide.bullets].join(' '));
 const request=slide.materialRequest||slideTagRequirements(slide),tagLogicFits=c=>Boolean(request.logic&&(c.pageTags?.logic?.primary===request.logic||c.pageTags?.logic?.secondary?.includes(request.logic)));
 const coreFamilies=new Set(components.filter(c=>c.scope==='core').map(c=>c.familyId));
 return components.filter(c=>c.layout&&autoMaterialSuitable(slide,c)&&!used.has(c.id)&&!used.has(materialIdentity(c))&&c.autoUse!==false&&c.pageTags?.reuse?.generationReady!==false&&(!c.dataRisk||c.tableBinding)&&c.slots?.length&&
  (!slide.materialRequest?.moduleCountExplicit||!c.pageTags?.structure?.moduleCount||c.pageTags.structure.moduleCount===slide.materialRequest.moduleCount)&&
  (slide.kind!=='ending'||(c.purpose||classifyPurpose(c.title,c.text,c.relation))==='ending')&&
  (slide.kind!=='agenda'||!agendaItemCount(c)||agendaItemCount(c)===(slide.bullets?.length||0))&&
  (['cover','agenda'].includes(slide.kind)||materialScope!=='core'||c.scope==='core')&&(materialScope!=='full'||c.scope!=='core')&&
  (materialScope!=='auto'||c.scope!=='core')&&
  (slide.kind==='agenda'||(c.purpose||classifyPurpose(c.title,c.text,c.relation))!=='agenda')&&
  (slide.kind==='cover'||slide.kind==='ending'||!['cover','ending'].includes(c.purpose||classifyPurpose(c.title,c.text,c.relation)))&&
  (slide.kind==='cover'?(c.purpose||classifyPurpose(c.title,c.text,c.relation))==='cover':(c.purpose||classifyPurpose(c.title,c.text,c.relation))!=='cover')&&
  (c.purpose||classifyPurpose(c.title,c.text,c.relation))!=='instruction'&&
  (slide.kind==='agenda'?c.relation==='agenda':c.relation!=='agenda')&&
  (['cover','agenda'].includes(slide.kind)||!slide.visual||slide.visual==='text'||tagLogicFits(c)||({parallel:['parallel','compare'],compare:['compare'],process:['process','timeline'],timeline:['timeline','process'],architecture:['architecture','hub','hierarchy'],hub:['hub','responsibility'],responsibility:['responsibility','hub','matrix'],matrix:['matrix'],cycle:['cycle'],hierarchy:['hierarchy','architecture']}[slide.visual]||[]).includes(c.relation))).map(c=>{
   const content=c.title+' '+c.text+' '+c.tags.join(' '),overlap=[...query].filter(w=>content.includes(w)).length;
   let score=overlap*3+(c.relation===slide.visual?18:0)+(c.sourceId===referenceId?18:0)+(c.reference?4:0)-(used.has(c.id)||used.has(c.familyId)?65:0);
   const ideal=Math.max(4,slide.bullets.length*3);score-=Math.abs(contentSlots(c).filter(s=>!s.fixed).length-ideal)*1.8;score-=Math.max(0,(c.nativeObjects||0)-65)*.2;
   if(c.tableBinding&&slide.visual!=='matrix')score-=16;
   if(slide.visual==='matrix'&&!c.tableBinding)score-=18;
   if(c.nativeObjects<5)score-=15;
   const tagMatch=matchPageTags(c.pageTags,request);score+=tagMatch.score;
   return {component:c,score,tagMatch};
  }).sort((a,b)=>b.score-a.score||a.component.id.localeCompare(b.component.id));
}
export function fallbackBindings(slide,layout){
 const labels=slide.bullets.map(b=>b.split(/[：:]/)[0]),details=slide.bullets.map(b=>b.includes('：')?b.slice(b.indexOf('：')+1):b),li={value:0},bi={value:0};
 return layout.slots.map(s=>({slot:s.index,text:isDecorativeSourceSlot(s,layout)?'':s.fixed||String(s.role==='symbol'?(labels[li.value++]||'').slice(0,1):['label','cell'].includes(s.role)?labels[li.value++]||'':details[bi.value++]||'').slice(0,s.maxChars)}));
}
export async function prepareEditableComponent(id){
 const catalog=await readComponents(),component=catalog.items.find(c=>c.id===id);if(!component)throw new Error('组件不存在');
 // Always inspect the source again when a user chooses another design.
 if(component.dataKinds?.some(k=>['chart','ole','smartart'].includes(k)))throw new Error('该组件含独立数据对象，请使用原生图表的数据绑定流程');
 const zip=await openZip(await sourceBuffer(component.sourceId)),doc=parse(await zip.file(component.part).async('string')),targets=componentNodes(doc,component).flatMap(editableTextTargets);
 if(!targets.length)throw new Error('该元素没有可填写的文字位置，请通过“加入素材元素”插入');
 if(targets.length>128)throw new Error('组件文字位置过多，请选择较小的组合');
 const prepared={...component,layout:true,scope:component.scope||'group',purpose:component.purpose||'content',slots:describeTextSlots(targets,{width:component.width,height:component.height}),textSlots:targets.length,tableBinding:component.dataKinds?.includes('table')};
 await saveComponents(db=>{const i=db.items.findIndex(c=>c.id===id);db.items[i]=prepared;});return prepared;
}
export function describeTextSlots(targets,order,{fontSizeOf}={}){
 return targets.map((n,index)=>{
   const text=textOf(n),box=nodeBounds(n),font=fontSizeOf?.(n)||Math.max(0,...['rPr','defRPr','endParaRPr'].flatMap(key=>elements(n,key)).map(p=>Number(p.getAttribute('sz')||0)/100))||18;
   const fixed=/^(?:0?[1-9]|[A-Z]|[①②③④⑤⑥⑦⑧⑨⑩])$/.test(text.trim())?text.trim():null;
   const role=n.localName==='tc'?'cell':fixed?'number':font>=30&&text.length<=3?'symbol':text.length<=15||(box&&box.h/12700/font<1.8)?'label':'body';
   const capacity=box?Math.max(1,Math.floor((box.w/12700-12)/Math.max(10,font)))*Math.max(1,Math.floor((box.h/12700-4)/(Math.max(10,font)*1.1))):Math.max(18,text.length*1.15);
   const table=n.localName==='tc'?{row:Array.from(n.parentNode.parentNode.childNodes).filter(n=>n.localName==='tr').indexOf(n.parentNode),column:Array.from(n.parentNode.childNodes).filter(n=>n.localName==='tc').indexOf(n)}:undefined;
   const shape=first(n,'prstGeom')?.getAttribute('prst'),narrowLabel=role==='label'&&shape&&shape!=='rect';
   return {index,role,sample:text.slice(0,180),font,maxChars:fixed?fixed.length:role==='symbol'?2:narrowLabel?Math.max(2,Math.min(text.length,capacity)):role==='label'?Math.max(4,text.length,Math.min(capacity,text.length+24)):Math.min(260,Math.max(18,Math.min(Math.max(text.length*1.25,capacity),text.length+30))),fixed,table,position:(()=>{const p=absoluteNodeBounds(n)||box;return p?{x:+(p.x/order.width).toFixed(3),y:+(p.y/order.height).toFixed(3),w:+(p.w/order.width).toFixed(3),h:+(p.h/order.height).toFixed(3)}:undefined;})()};
  });
}

