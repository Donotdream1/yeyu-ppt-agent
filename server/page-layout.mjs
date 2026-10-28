import {frameUsage} from './material-geometry.mjs';
import {designSystem} from './design-system.mjs';
import {bnaBodyArea} from './bna-template.mjs';

const areaFor=t=>t.safeArea||{x:.055,y:.16,w:.89,h:.76};
export function composeHermesSlide(slide,page,template){
 const area=areaFor(template),c=slide.materialSnapshot,system=designSystem(template),blocks=[];
 const add=b=>blocks.push({id:`p${page+1}-b${blocks.length+1}`,...b});
 const top=area.y+.11,body=template.bnaProfile?bnaBodyArea(template,template.bnaProfile,slide):{x:area.x,y:top,w:area.w,h:Math.max(.2,area.h-.11)};
 add({type:'text',role:'title',text:slide.title,x:area.x,y:area.y,w:area.w,h:.09,fontSize:30});
 if(!c)return null;
 if(slide.kind==='ending'&&c.sourceFullPage)return {...slide,layoutRecipe:'visual',stylePolicy:'harmonized',blocks:[{id:`p${page+1}-ending`,type:'component',componentId:c.id,materialSnapshot:c,x:0,y:0,w:1,h:1,bindText:true,textBindings:slide.materialBindings,colorMode:'source'}],layoutReview:{recipe:'native-ending',materialUsage:{width:1,height:1,area:1},sourceObjects:c.nativeObjects,retainedObjects:c.nativeObjects,font:system.font}};
 let recipe=slide.layoutRecipe||'auto';
 const usage=frameUsage(c.bounds,body,template);
 if(recipe==='narrative-visual'&&!slide.narrativeRequested)recipe='auto';
 if(recipe==='auto')recipe=c.geometry?.reflowSafe&&usage.area<.68?'reflow':'visual';
 const addComponent=(snapshot,frame,bindings)=>{
  const ratio=(frame.w*template.width/(frame.h*template.height))/(snapshot.bounds.w/snapshot.bounds.h),min=template.bnaProfile ? .85 : .72,max=template.bnaProfile ? 1.18 : 1.38;
  const agendaReflow=slide.kind==='agenda'&&snapshot.scope==='reflow-island'&&c.geometry?.reflowSafe;
  const fitMode=agendaReflow||ratio>=min&&ratio<=max?'fill':'contain';
  add({fitMode,type:'component',componentId:c.id,materialSnapshot:snapshot,...frame,bindText:true,textBindings:bindings,colorMode:'harmonized'});
 };
 if(recipe==='reflow'&&c.geometry?.reflowSafe){
  const islands=c.geometry.islands,cols=islands.length<=3?islands.length:Math.ceil(islands.length/2),rows=Math.ceil(islands.length/cols),gx=.025,gy=.035;
  islands.forEach((island,i)=>{
   const keys=new Set(island.keys),slots=c.slots.filter(s=>keys.has(s.key.split(':')[1])),bindings=slide.materialBindings.filter(b=>slots.some(s=>s.key===b.key));
   const snapshot={...c,nodeIndices:island.nodeIndices,bounds:island.bounds,slots,nativeObjects:island.nativeObjects,geometry:undefined,scope:'reflow-island'};
   const w=(body.w-gx*(cols-1))/cols,h=(body.h-gy*(rows-1))/rows;
   const row=Math.floor(i/cols),rowItems=Math.min(cols,islands.length-row*cols),offset=(cols-rowItems)*(w+gx)/2;
   addComponent(snapshot,{x:body.x+offset+(i%cols)*(w+gx),y:body.y+row*(h+gy),w,h},bindings);
  });
 }else if(recipe==='narrative-visual'){
  const left=body.w*.20,gap=.02,visualFrame={x:body.x+left+gap,y:body.y,w:body.w-left-gap,h:body.h};
  addComponent(c,visualFrame,slide.materialBindings);
  const items=slide.bullets.length?slide.bullets:[slide.subtitle||slide.title],cell=body.h/items.length;
  items.forEach((text,i)=>{const p=text.search(/[：:]/),label=p>=0?text.slice(0,p):text.slice(0,12),detail=p>=0?text.slice(p+1):text;add({type:'text',role:'label',text:label,x:body.x,y:body.y+i*cell,w:left,h:Math.min(.07,cell*.3),fontSize:20});add({type:'text',role:'body',text:detail,x:body.x,y:body.y+i*cell+Math.min(.075,cell*.32),w:left,h:Math.max(.05,cell-Math.min(.075,cell*.32)-.02),fontSize:17});});
 }else{
  recipe='visual';addComponent(c,body,slide.materialBindings);
  const covered=new Set((slide.materialBindings||[]).flatMap(b=>b.contentIds||[])),missing=slide.bullets.filter((_,i)=>!covered.has('u'+(i+1)));
  if(missing.length&&slide.adaptation?.status==='checked')throw Error('存在未绑定的可见要点，请重新分配到素材，不能自动添加重复说明栏');
  if(missing.length){const h=Math.min(.14,body.h*.22);blocks[1].h=body.h-h-.025;const n=missing.length,w=(body.w-.025*(n-1))/n;missing.forEach((text,i)=>add({type:'text',role:'body',text,x:body.x+i*(w+.025),y:body.y+body.h-h,w,h,fontSize:16}));}
 }
 const usedFrames=blocks.filter(b=>b.type==='component').map(b=>{const u=b.fitMode==='fill'?{width:1,height:1}:frameUsage(b.materialSnapshot.bounds,b,template),w=b.w*u.width,h=b.h*u.height;return {x:b.x+(b.w-w)/2,y:b.y+(b.h-h)/2,w,h};});
 const measuredUsage={width:+((Math.max(...usedFrames.map(b=>b.x+b.w))-Math.min(...usedFrames.map(b=>b.x)))/body.w).toFixed(3),height:+((Math.max(...usedFrames.map(b=>b.y+b.h))-Math.min(...usedFrames.map(b=>b.y)))/body.h).toFixed(3),area:+(usedFrames.reduce((sum,b)=>sum+b.w*b.h,0)/(body.w*body.h)).toFixed(3)};
 const coverage=blocks.filter(b=>b.type==='component').reduce((n,b)=>n+b.materialSnapshot.nativeObjects,0);
 if(coverage!==c.nativeObjects)throw new Error('原生素材分组重排导致对象遗漏，已停止导出');
 return {...slide,layoutRecipe:recipe,stylePolicy:'harmonized',templatePage:slide.templatePage||1,blocks,layoutReview:{recipe,materialUsage:measuredUsage,sourceObjects:c.nativeObjects,retainedObjects:coverage,font:system.font,palette:[system.primary,system.accent,system.secondary],background:system.background}};
}
