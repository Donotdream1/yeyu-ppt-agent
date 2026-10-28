import {elements,first,NS} from './ooxml.mjs';
import {direct,absoluteNodeBounds} from './components.mjs';
import {applyTextColor} from './typography.mjs';

const rgb=h=>h.match(/../g).map(v=>parseInt(v,16));
const lum=h=>rgb(h).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const valid=(v,f)=>/^[a-f0-9]{6}$/i.test(v||'')?v.toUpperCase():f;
export function designSystem(template){const p=template.designPalette||{},primary=valid(p.primary||template.theme?.primary,'202020'),background=valid(p.background||template.theme?.background,'FFFFFF'),dark=lum(background)<.2;return {font:template.fontPolicy?.body||'微软雅黑',primary,accent:valid(p.accent||template.theme?.secondary,primary),secondary:valid(p.secondary||template.theme?.secondary,primary),surface:valid(p.surface,background),background,text:valid(p.text||template.theme?.text,dark?'FFFFFF':'202020'),muted:valid(p.muted,'666666'),paletteColors:p.colors||[primary],paletteMode:p.mode||'template'};}

function textAncestor(n){for(let p=n;p;p=p.parentNode)if(['rPr','defRPr','endParaRPr'].includes(p.localName))return true;return false;}
export function harmonizeNative(node,template){
 const s=designSystem(template),palette=s.paletteColors.length?s.paletteColors:[s.primary,s.accent,s.secondary];
 if(s.paletteMode==='material')return s;
 for(const c of elements(node,'srgbClr')){
  if(textAncestor(c))continue;const color=valid(c.getAttribute('val'),'FFFFFF'),v=rgb(color),high=Math.max(...v),low=Math.min(...v);
  if(high-low<22){c.setAttribute('val',lum(color)>.8?s.surface:lum(color)<.12?s.accent:s.surface);continue;}
  const hue=v.indexOf(high),base=palette[hue%palette.length];c.setAttribute('val',lum(color)>.65?s.surface:base);
 }
 return s;
}
export function customGeometryContains(node,u=.5,v=.5){
 const geom=first(node,'custGeom');if(!geom)return true;let winding=0,known=false;
 const point=n=>{const p=first(n,'pt');return p?{x:Number(p.getAttribute('x')),y:Number(p.getAttribute('y'))}:null;};
 for(const path of elements(geom,'path')){
  if(path.getAttribute('fill')==='none')continue;const width=Number(path.getAttribute('w')),height=Number(path.getAttribute('h'));if(!width||!height)continue;const q={x:u*width,y:v*height},contours=[];let points=[],current=null;
  for(const command of Array.from(path.childNodes).filter(n=>n.nodeType===1)){
   if(command.localName==='moveTo'){if(points.length)contours.push(points);current=point(command);points=current?[current]:[];}
   else if(command.localName==='lnTo'){current=point(command);if(current)points.push(current);}
   else if(command.localName==='cubicBezTo'&&current){const p=elements(command,'pt').map(n=>({x:Number(n.getAttribute('x')),y:Number(n.getAttribute('y'))}));if(p.length===3){const base=current;for(let i=1;i<=16;i++){const t=i/16,k=1-t;points.push({x:k*k*k*base.x+3*k*k*t*p[0].x+3*k*t*t*p[1].x+t*t*t*p[2].x,y:k*k*k*base.y+3*k*k*t*p[0].y+3*k*t*t*p[1].y+t*t*t*p[2].y});}current=p[2];}}
   else if(command.localName==='close'){if(points.length)contours.push(points);points=[];}
   else return true; // unknown arc/formula: retain the conservative source fill
  }
  if(points.length)contours.push(points);for(const poly of contours){if(poly.length<3||poly.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))continue;known=true;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],side=(b.x-a.x)*(q.y-a.y)-(q.x-a.x)*(b.y-a.y);if(a.y<=q.y&&b.y>q.y&&side>0)winding++;else if(a.y>q.y&&b.y<=q.y&&side<0)winding--;}}
 }
 return !known||winding!==0;
}
const shapeFill=(n,u=.5,v=.5)=>{if(!customGeometryContains(n,u,v))return null;const p=direct(n,'spPr')||direct(n,'tcPr'),f=direct(p,'solidFill')||direct(p,'gradFill');if(!f)return null;return elements(f,'srgbClr').map(n=>n.getAttribute('val')).filter(v=>/^[a-f0-9]{6}$/i.test(v)).sort((a,b)=>lum(b)-lum(a))[0]||null;};

export function harmonizedText(node,group,template){
 const s=designSystem(template);if(s.paletteMode==='material')return null;const box=absoluteNodeBounds(node),shapes=[...elements(group,'sp'),...elements(group,'tc')];let bg=shapeFill(node);
 if(!bg&&box){const x=box.x+box.w/2,y=box.y+box.h/2,limit=shapes.indexOf(node);const candidates=shapes.slice(0,limit<0?shapes.length:limit).map(n=>{const b=absoluteNodeBounds(n);return {b,c:b?shapeFill(n,(x-b.x)/Math.max(1,b.w),(y-b.y)/Math.max(1,b.h)):null};}).filter(v=>v.c&&v.b&&x>=v.b.x&&x<=v.b.x+v.b.w&&y>=v.b.y&&y<=v.b.y+v.b.h).sort((a,b)=>a.b.w*a.b.h-b.b.w*b.b.h);bg=candidates[0]?.c;}
 const color=lum(valid(bg,s.background))<.28?'FFFFFF':s.text;applyTextColor(node,color);return color;
}
