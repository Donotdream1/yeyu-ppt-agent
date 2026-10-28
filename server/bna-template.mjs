import {parse,serialize,elements,first,textShape,setShapeText,NS} from './ooxml.mjs';
import {direct,drawingNodes,unionBounds,absoluteNodeBounds} from './components.mjs';
import {visibleNodeBounds} from './material-geometry.mjs';
import {applyTextColor,replaceTextPreservingStyles} from './typography.mjs';
import {styleNativeText} from './native-primitives.mjs';
import {coverFields} from './presentation-outline.mjs';

const oldNavigation=['25年工作综述','25年重点工作','重点案例','26年重点工作'];
export const BNA_NAVIGATION_STYLE=Object.freeze({fontFamily:'微软雅黑',fontSize:20,bold:true,y:.022,h:.045});
export function removeCoverTemplateNotice(doc){
 let removed=0;
 for(const shape of [...elements(doc,'sp')]){
  const text=elements(shape,'t').map(t=>t.textContent).join('').replace(/[\s·•，,。.!！:：;；、]/g,'');
  if(/^商业资料注意(?:保存|保密)$/.test(text)){shape.parentNode.removeChild(shape);removed++;}
 }
 return removed;
}
export function bnaBodyArea(canvas,profile,slide){
 const area=profile.bodyArea;
 if(slide.kind!=='agenda')return area;
 const size=Math.min(64,Math.max(24,slide.materialSnapshot?.agendaHeading?.fontSize||30));
 const y=Math.max(area.y,.105+Math.max(.08,size*1.25/(canvas.height/12700))+.025);
 return {...area,y,h:area.y+area.h-y};
}
export function styleBnaNavigation(doc,canvas){
 const nodes=elements(doc,'sp').filter(n=>/^navigation:bna-nav-/.test(first(n,'cNvPr')?.getAttribute('name')||''));
 for(const node of nodes){
  const xf=direct(direct(node,'spPr'),'xfrm'),off=direct(xf,'off');if(!off)throw Error('BNA导航缺少位置参数');off.setAttribute('y',String(Math.round(BNA_NAVIGATION_STYLE.y*canvas.height)));
  for(const kind of ['rPr','defRPr','endParaRPr'])for(const prop of elements(node,kind)){prop.setAttribute('b','1');prop.setAttribute('sz',String(BNA_NAVIGATION_STYLE.fontSize*100));for(const family of ['latin','ea','cs']){let font=direct(prop,family);if(!font){font=doc.createElementNS(NS.a,'a:'+family);prop.appendChild(font);}font.setAttribute('typeface',BNA_NAVIGATION_STYLE.fontFamily);}}
 }
 return nodes;
}
export async function cleanBnaMasterExamples(zip,templateLabels=[]){
 for(const part of Object.keys(zip.files).filter(n=>/^ppt\/(slideMasters|slideLayouts)\/[^/]+\.xml$/.test(n))){
  const doc=parse(await zip.file(part).async('string'));
  for(const sp of [...elements(doc,'sp')]){const text=elements(sp,'t').map(t=>t.textContent).join('').trim(),type=first(sp,'ph')?.getAttribute('type');if([...oldNavigation,...templateLabels].includes(text)||type==='sldNum')sp.parentNode.removeChild(sp);}
  zip.file(part,serialize(doc));
 }
}
export function fillBnaCover(doc,plan,profile,canvas={width:12192000,height:6858000}){
 removeCoverTemplateNotice(doc);
 const shapes=elements(doc,'sp'),title=shapes.find(n=>first(n,'cNvPr')?.getAttribute('name')==='文本框 33'),period=shapes.find(n=>first(n,'cNvPr')?.getAttribute('name')==='文本框 21');
 if(!title||!period)return;
 const cover=coverFields(plan),tree=first(doc,'spTree');let id=Math.max(...elements(doc,'cNvPr').map(n=>Number(n.getAttribute('id'))))+1;
 const clone=name=>{const node=period.cloneNode(true);first(node,'cNvPr').setAttribute('id',String(id++));first(node,'cNvPr').setAttribute('name',name);tree.appendChild(node);return node;};
 const unit=clone('cover-unit'),presenter=clone('cover-presenter');
 for(const [node,text,y,h,size,bold]of [[title,cover.title,.38,.11,44,true],[unit,cover.unit,.505,.075,28,true],[presenter,'汇报人：'+cover.presenter,.73,.055,18,false],[period,'汇报时间：'+cover.reportDate,.80,.055,18,false]]){
  const xf=direct(direct(node,'spPr'),'xfrm');direct(xf,'off').setAttribute('x',String(Math.round(canvas.width*.1)));direct(xf,'off').setAttribute('y',String(Math.round(canvas.height*y)));direct(xf,'ext').setAttribute('cx',String(Math.round(canvas.width*.8)));direct(xf,'ext').setAttribute('cy',String(Math.round(canvas.height*h)));
  replaceTextPreservingStyles(doc,node,text);applyTextColor(node,profile.coverTitleColor||'FFFFFF');styleNativeText(node,{id:'cover-'+id++,role:'cover',fontSize:size,bold,align:'center',vAlign:'middle',textInsetPt:0});
 }
}
export function layoutBnaContent(doc,canvas,profile,slide,page,sectionLabels){
 for(const node of [...elements(doc,'sp')]){const text=elements(node,'t').map(t=>t.textContent).join('').trim(),b=absoluteNodeBounds(node),legacy=[...oldNavigation,...(profile.sections||[]),...(sectionLabels||[])].includes(text)&&b&&b.y<canvas.height*.1&&b.x>canvas.width*.35;if(legacy||/^navigation:bna-nav-/.test(first(node,'cNvPr')?.getAttribute('name')||''))node.parentNode.removeChild(node);}
 const title=elements(doc,'sp').find(n=>first(n,'cNvPr')?.getAttribute('name')==='Text 2'),tree=first(doc,'spTree'),report={page:page+1,layout:'bna-template',titleColor:profile.titleColor||'002060',navigationStyle:BNA_NAVIGATION_STYLE,bodyTop:profile.bodyArea.y};
 if(title){
  const agendaStyle=slide.kind==='agenda'?slide.materialSnapshot?.agendaHeading:null,size=agendaStyle?Math.min(64,Math.max(24,agendaStyle.fontSize||30)):30,color=agendaStyle?.textColor||profile.titleColor||'002060',height=Math.max(.08,size*1.25/(canvas.height/12700));
  if(slide.kind==='agenda')replaceTextPreservingStyles(doc,title,'目录');if(slide.kind==='ending')replaceTextPreservingStyles(doc,title,'');const xf=direct(direct(title,'spPr'),'xfrm');direct(xf,'off').setAttribute('y',String(Math.round(canvas.height*.105)));direct(xf,'off').setAttribute('x',String(Math.round(canvas.width*.04)));direct(xf,'ext').setAttribute('cx',String(Math.round(canvas.width*.92)));direct(xf,'ext').setAttribute('cy',String(Math.round(canvas.height*height)));applyTextColor(title,color);styleNativeText(title,{id:'bna-title',role:'title',fontSize:size,bold:agendaStyle?agendaStyle.bold:true,textInsetPt:0});
 }
 const groups=drawingNodes(doc).filter(n=>n.localName==='grpSp'),bounds=unionBounds(groups.map(visibleNodeBounds)),area=bnaBodyArea(canvas,profile,slide);
 if(bounds&&groups.length){const target={x:area.x*canvas.width,y:area.y*canvas.height,w:area.w*canvas.width,h:area.h*canvas.height},scale=Math.min(target.w/bounds.w,target.h/bounds.h),left=target.x+(target.w-bounds.w*scale)/2;
  const materialY=target.y+(slide.kind==='agenda'?(target.h-bounds.h*scale)*.56:0);
  for(const group of groups){const xf=direct(direct(group,'grpSpPr'),'xfrm'),off=direct(xf,'off'),ext=direct(xf,'ext');if(!off||!ext)continue;off.setAttribute('x',String(Math.round(left+(Number(off.getAttribute('x'))-bounds.x)*scale)));off.setAttribute('y',String(Math.round(materialY+(Number(off.getAttribute('y'))-bounds.y)*scale)));for(const key of ['cx','cy'])ext.setAttribute(key,String(Math.round(Number(ext.getAttribute(key))*scale)));}
  report.materialTop=area.y;report.materialScale=scale;
 }
 let id=Math.max(1,...elements(doc,'cNvPr').map(n=>Number(n.getAttribute('id'))))+1;
 const add=(text,x,y,w,h,size,color,active=false)=>{const n=parse(`<root xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${textShape(id++,text,Math.round(x*canvas.width),Math.round(y*canvas.height),Math.round(w*canvas.width),Math.round(h*canvas.height),size,color,active)}</root>`).documentElement.firstChild,node=doc.importNode(n,true);styleNativeText(node,{id:'bna-nav-'+id,role:'navigation',fontSize:size,bold:active,align:'center',textInsetPt:0});if(active)for(const p of elements(node,'rPr'))p.setAttribute('u','sng');tree.appendChild(node);};
 const sections=Array.isArray(sectionLabels)?sectionLabels:[],active=slide.kind==='agenda'?-1:Math.min(Math.max(0,slide.sectionIndex||0),sections.length-1),step=.56/Math.max(1,sections.length);
 sections.forEach((label,i)=>add(label,.42+i*step,BNA_NAVIGATION_STYLE.y,step-.005,BNA_NAVIGATION_STYLE.h,BNA_NAVIGATION_STYLE.fontSize,i===active?(profile.titleColor||'002060'):'808080',i===active));styleBnaNavigation(doc,canvas);report.navigationSections=[...sections];report.activeSection=active;return report;
}
