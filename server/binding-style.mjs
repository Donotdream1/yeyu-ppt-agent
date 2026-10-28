import {z} from 'zod';
import {first,elements,NS} from './ooxml.mjs';
import {absoluteNodeBounds,nodeBounds,direct} from './components.mjs';
export const bindingStyleSchema=z.object({fontSize:z.number().min(14).max(32).optional(),bold:z.boolean().optional(),align:z.enum(['left','center','right']).optional(),vAlign:z.enum(['top','middle','bottom']).optional(),photoPlaceholder:z.boolean().optional()});
const child=(node,name)=>Array.from(node?.childNodes||[]).find(n=>n.nodeType===1&&n.localName===name);
export function applyBindingStyle(node,value){
 if(!value)return null;const style=bindingStyleSchema.parse(value),body=first(node,'txBody');if(!body)return null;
 let props=child(body,'bodyPr');if(!props){props=node.ownerDocument.createElementNS(NS.a,'a:bodyPr');body.insertBefore(props,body.firstChild);}
 if(style.vAlign)props.setAttribute('anchor',({top:'t',middle:'ctr',bottom:'b'})[style.vAlign]);
 props.setAttribute('wrap','square');
 if(style.photoPlaceholder&&node.localName==='sp'){
  const sp=child(node,'spPr');if(sp){let line=child(sp,'ln');if(!line){line=node.ownerDocument.createElementNS(NS.a,'a:ln');sp.insertBefore(line,Array.from(sp.childNodes).find(n=>['effectLst','effectDag','scene3d','sp3d','extLst'].includes(n.localName))||null);}line.setAttribute('w','9525');
   for(const n of Array.from(line.childNodes))line.removeChild(n);
   const fill=node.ownerDocument.createElementNS(NS.a,'a:solidFill'),color=node.ownerDocument.createElementNS(NS.a,'a:srgbClr');color.setAttribute('val',first(first(node,'rPr'),'srgbClr')?.getAttribute('val')||'808080');fill.appendChild(color);line.appendChild(fill);
   const dash=node.ownerDocument.createElementNS(NS.a,'a:prstDash');dash.setAttribute('val','dash');line.appendChild(dash);
  }
 }
 if(style.vAlign==='middle'){
  for(const key of ['tIns','bIns','lIns','rIns'])props.setAttribute(key,'0');
  for(const auto of Array.from(props.childNodes))if(['spAutoFit','normAutofit'].includes(auto.localName))props.removeChild(auto);
  if(!child(props,'noAutofit'))props.appendChild(node.ownerDocument.createElementNS(NS.a,'a:noAutofit'));
  for(const p of elements(body,'pPr')){p.setAttribute('marL','0');p.setAttribute('marR','0');p.setAttribute('indent','0');for(const n of Array.from(p.childNodes))if(['spcBef','spcAft','lnSpc','buChar','buAutoNum','buBlip'].includes(n.localName))p.removeChild(n);if(!child(p,'buNone'))p.insertBefore(node.ownerDocument.createElementNS(NS.a,'a:buNone'),child(p,'tabLst')||child(p,'defRPr')||child(p,'extLst')||null);}
  for(const prop of elements(body,'rPr')){prop.removeAttribute('baseline');prop.removeAttribute('normalizeH');}
 }
 for(const p of Array.from(body.childNodes).filter(n=>n.localName==='p')){let pp=child(p,'pPr');if(!pp){pp=node.ownerDocument.createElementNS(NS.a,'a:pPr');p.insertBefore(pp,p.firstChild);}if(style.align)pp.setAttribute('algn',({left:'l',center:'ctr',right:'r'})[style.align]);}
 for(const name of ['rPr','defRPr','endParaRPr'])for(const prop of elements(body,name)){if(style.bold!==undefined)prop.setAttribute('b',style.bold?'1':'0');if(style.fontSize!==undefined)prop.setAttribute('sz',String(Math.round(style.fontSize*100)));}
 return style;
}

export function centerLabelOnContainer(node,group){
 const box=absoluteNodeBounds(node),local=nodeBounds(node);if(!box||!local||first(node,'prstGeom')?.getAttribute('prst')==='ellipse')return false;
 const cx=box.x+box.w/2,cy=box.y+box.h/2;
 const candidates=elements(group,'sp').filter(n=>n!==node&&first(n,'prstGeom')?.getAttribute('prst')==='ellipse').map(n=>absoluteNodeBounds(n)).filter(b=>b&&b.w>=box.w*.8&&b.w<=box.w*1.8&&b.h>=box.h&&b.h<=box.h*3&&Math.abs(b.x+b.w/2-cx)<box.w*.25&&Math.abs(b.y+b.h/2-cy)<box.h*.65).sort((a,b)=>a.w*a.h-b.w*b.h);
 const target=candidates[0];if(!target)return false;
 const xf=direct(direct(node,'spPr'),'xfrm'),off=direct(xf,'off'),ext=direct(xf,'ext');if(!off||!ext)return false;
 const sx=box.w/local.w,sy=box.h/local.h;
 off.setAttribute('x',String(Math.round(local.x+(target.x-box.x)/sx)));off.setAttribute('y',String(Math.round(local.y+(target.y-box.y)/sy)));
 ext.setAttribute('cx',String(Math.round(target.w/sx)));ext.setAttribute('cy',String(Math.round(target.h/sy)));
 return true;
}

export function fitTwoLineLabel(node,fontSize){
 const local=nodeBounds(node),box=absoluteNodeBounds(node);if(!local||!box||!fontSize)return false;
 const heightPt=box.h/12700,needed=fontSize*2.45;if(needed<=heightPt||needed>heightPt*1.8)return false;
 const xf=direct(direct(node,'spPr'),'xfrm'),off=direct(xf,'off'),ext=direct(xf,'ext');if(!off||!ext)return false;
 const height=Math.round(needed*12700/(box.h/local.h));off.setAttribute('y',String(Math.round(local.y-(height-local.h)/2)));ext.setAttribute('cy',String(height));return true;
}
