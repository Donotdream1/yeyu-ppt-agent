import {RESEARCH_PROFILE,researchStyle} from './research-profile.mjs';

export function composeResearchSlide(slide,page,template){
 const style=researchStyle(template.designPalette),colors=style.colors,W=style.canvas.widthCm,H=style.canvas.heightCm,r=slide.research,blocks=[];
 const add=b=>{const v={id:`research-p${page+1}-${b.role||b.type}-${blocks.length+1}`,...b};blocks.push(v);return v;};
 const rect=(x,y,w,h,fill='FFFFFF',stroke=colors.border,role='module')=>add({type:'shape',shapeKind:'rect',role,x:x/W,y:y/H,w:w/W,h:h/H,fill,stroke,strokeWidth:.65});
 const text=(value,x,y,w,h,size=14,{role='body',bold=false,center=false,color=colors.text,...extra}={})=>add({type:'text',role,text:String(value||''),x:x/W,y:y/H,w:w/W,h:h/H,fontSize:size,textColor:color,bold,align:center?'center':'left',vAlign:'center',...extra});
 const line=(x,y,w,h=0,arrow=false,rotation=0)=>add({type:'shape',shapeKind:'line',role:'connection',x:x/W,y:y/H,w:w/W,h:h/H,stroke:colors.primary,strokeWidth:.85,arrow,rotation});
 const component=(c,x,y,w,h)=>add({type:'component',role:'research-asset',componentId:c.id,materialSnapshot:c,x:x/W,y:y/H,w:w/W,h:h/H,bindText:false,colorMode:'source',flatStyle:true});
 const assets=slide.researchAssets||[],asset=(i,x,y,w,h)=>{if(assets[i])component(assets[i],x,y,w,h);};
 // User's reference skeleton, in centimetres; source slide decorations are not copied.
 text(r.sectionNumber||String(page+1).padStart(2,'0'),.75,.35,1.6,1.6,32,{role:'chapter',bold:true,color:colors.primary});
 line(2.48,.65,0,1.0);text(slide.title,2.78,.45,25.54,1.4,32,{role:'main-title',bold:true,color:colors.primary});
 if(template.researchLogo)component(template.researchLogo,29.45,.5,3.65,1.15);
 if(template.institutionName)text(template.institutionName,28.2,1.6,4.9,.4,10,{role:'institution',center:true,color:colors.muted});
 add({type:'shape',shapeKind:'line',role:'header-rule',x:.75/W,y:2.0/H,w:32.37/W,h:0,stroke:colors.border,strokeWidth:.6});
 rect(.75,2.3,32.37,1.5);text('✓',1.05,2.45,.65,1.1,21,{role:'check',bold:true,color:colors.primary});text(r.viewpoint,1.9,2.4,30.6,1.3,16,{role:'viewpoint',bold:true});
 rect(.75,4.05,32.37,1.2,colors.bar,colors.bar,'content-bar');text(r.contentTitle,1,4.08,31.87,1.1,21,{role:'section',bold:true,center:true,color:'FFFFFF'});
 const modules=r.modules?.length?r.modules:slide.bullets.map((value,i)=>{const p=value.search(/[：:]/);return {title:p<0?`要点${i+1}`:value.slice(0,p),body:p<0?value:value.slice(p+1)};});
 if(slide.chart){
  if(slide.researchChartSnapshot){const c=slide.researchChartSnapshot;add({type:'component',role:'research-chart',componentId:c.id,materialSnapshot:c,chart:slide.chart,bindData:true,bindText:false,colorMode:'source',flatStyle:true,x:1.2/W,y:5.8/H,w:31.4/W,h:10.3/H});}else add({type:'chart',role:'research-chart',chart:slide.chart,x:1.2/W,y:5.8/H,w:31.4/W,h:10.3/H});text(slide.chart.title,1,16.2,31.87,.55,14,{role:'figure-caption',bold:true,center:true});
 }else if(r.layout==='technical-route'){
  const rows=modules,gap=.22,rowH=(11.4-gap*(rows.length-1))/rows.length;
  rows.forEach((m,i)=>{const y=5.5+i*(rowH+gap);rect(.75,y,32.37,rowH);rect(.75,y,4.86,rowH,colors.surface);text(m.title,1,y+.15,4.36,rowH-.3,17,{role:'module-title',bold:true,center:true,color:colors.primary});const steps=m.steps?.length?m.steps:[{title:m.title,body:m.body}],cellW=19.42/steps.length;
   steps.forEach((step,j)=>{const sx=5.75+j*cellW,hasAsset=Boolean(assets[i*3+j]);rect(sx+.2,y+.25,cellW-.4,rowH-.5,colors.surface);if(hasAsset)asset(i*3+j,sx+.35,y+.5,1.1,1.4);text(step.body||step.title||step,sx+(hasAsset?1.65:.4),y+.4,cellW-(hasAsset?1.95:.8),Math.max(.6,rowH-1.35),14,{center:!hasAsset});text(step.title||step,sx+.3,y+rowH-.85,cellW-.6,.65,14,{role:'figure-caption',bold:true,center:true});if(j<steps.length-1&&r.relationshipEvidence)line(sx+cellW-.2,y+rowH*.4,.35,0,true);});text(m.notes||'',25.4,y+.25,7.2,rowH-.5,14);if(i<rows.length-1&&r.relationshipEvidence)line(16.9,y+rowH,.001,gap,true);});
 }else if(r.layout==='comparison'){
  const tableH=Math.min(7.5,Math.max(4.8,(r.table.rows.length+1)*1.08));add({type:'table',role:'comparison-table',x:.75/W,y:5.5/H,w:32.37/W,h:tableH/H,table:{...r.table,widths:[.18,.24,.29,.29],style:{headerFill:colors.bar,firstColumnFill:colors.surface,primary:colors.primary,text:colors.text,border:colors.border}}});
  const evidence=r.evidence?.length?r.evidence:modules,items=evidence,n=Math.max(1,items.length),gap=.35,cw=(32.37-gap*(n-1))/n,y=5.5+tableH+.35,h=16.9-y;
  items.forEach((item,i)=>{const x=.75+i*(cw+gap);rect(x,y,cw,h);asset(i,x+.25,y+.2,cw-.5,Math.min(2.8,h*.55));text(item.quote||item.body||item.caption,x+.25,y+(assets[i]?Math.min(2.8,h*.55)+.25:.15),cw-.5,Math.max(.4,h-.9-(assets[i]?Math.min(2.8,h*.55):0)),12,{role:'evidence'});rect(x,y+h-.7,cw,.7,colors.surface);text(item.caption||item.title,x+.1,y+h-.67,cw-.2,.6,14,{role:'figure-caption',bold:true,center:true,color:colors.primary});});
 }else if(r.layout==='cycle'){
  const cx=12.68,cy=7.0,diameter=8.5,palette=template.designPalette?.colors?.filter(c=>{const b=parseInt(c.slice(4),16),red=parseInt(c.slice(0,2),16);return b>red;})||[colors.primary];
  for(let i=0;i<4;i++)add({type:'shape',shapeKind:'cycle-quarter',role:'cycle-arrow',x:cx/W,y:cy/H,w:diameter/W,h:diameter/H,rotation:i*90,fill:palette[i%Math.max(1,palette.length)]||colors.primary,stroke:'FFFFFF',strokeWidth:.65});
  text('循环机制',cx+2.5,cy+3.3,3.5,1.4,17,{role:'module-title',bold:true,center:true,color:colors.primary});
  modules.forEach((m,i)=>{const x=i%2===0?.75:22.32,y=i<2?5.6:11.6;rect(x,y,10.8,5.0);rect(x,y,10.8,.8,colors.bar,colors.bar);text(`${String(i+1).padStart(2,'0')}  ${m.title}`,x+.2,y+.04,10.4,.7,17,{role:'module-title',bold:true,color:'FFFFFF'});asset(i,x+.3,y+1.1,3.2,2.3);text(m.body,x+(assets[i]?3.8:.35),y+1.0,assets[i]?6.65:10.1,3.65,14);});
 }else{
  const layers=r.layers?.length?r.layers:[{title:'内容层',modules}],gap=.25,rowH=(11.4-gap*(layers.length-1))/layers.length;
  layers.forEach((layer,i)=>{const y=5.5+i*(rowH+gap),items=layer.modules||[],left=3.7,supportW=6.0,middle=32.37-left-supportW-.5,cols=Math.max(1,Math.min(3,items.length)),rows=Math.ceil(items.length/cols),cw=(middle-.25*(cols-1))/cols,ch=(rowH-.2*(rows-1))/Math.max(1,rows);rect(.75,y,left,rowH,colors.bar,colors.bar);text(layer.title,.95,y+.1,left-.4,rowH-.2,17,{role:'layer-title',bold:true,center:true,color:'FFFFFF'});
   items.forEach((m,j)=>{const x=.75+left+.25+(j%cols)*(cw+.25),my=y+Math.floor(j/cols)*(ch+.2);rect(x,my,cw,ch,colors.surface);text(m.title,x+.2,my+.2,cw-.4,.8,17,{role:'module-title',bold:true,center:true,color:colors.primary});const hasAsset=Boolean(assets[i*3+j]);text(m.body,x+(hasAsset?1.85:.25),my+1.15,cw-(hasAsset?2.1:.5),Math.max(.6,ch-1.4),14);asset(i*3+j,x+.25,my+1.15,1.3,Math.min(1.5,ch-1.4));});
   const support=layer.support||r.support||r.conclusionEvidence?.[Math.min(i,r.conclusionEvidence.length-1)]||'';rect(27.12,y,6,rowH,colors.surface);text(layer.support?'支撑保障':'原文依据',27.32,y+.2,5.6,.7,17,{role:'module-title',bold:true,center:true,color:colors.primary});text(support,27.4,y+1.1,5.45,Math.max(.5,rowH-1.4),12,{role:'supplement'});if(i<layers.length-1&&r.relationshipEvidence)line(16.9,y+rowH,.001,gap,true);});
 }
 rect(.75,17.2,32.37,1.3);rect(1.05,17.66,.22,.22,'202020','202020','conclusion-marker');text(r.conclusion,1.55,17.25,31.1,1.2,15,{role:'conclusion',bold:true});
 text(String(page+1),31.9,18.5,1.0,.45,10,{role:'page',center:true,color:colors.muted});
 const retained=blocks.filter(b=>b.type==='component').reduce((n,b)=>n+b.materialSnapshot.nativeObjects,0);
 return {...slide,stylePolicy:'research-defense',blocks,templatePage:1,layoutReview:{recipe:r.layout,profile:style.id,sourceObjects:retained,retainedObjects:retained,nativeTextBlocks:blocks.filter(b=>b.type==='text').length,font:style.fonts,palette:template.designPalette,referenceStatus:RESEARCH_PROFILE.referenceStatus}};
}
