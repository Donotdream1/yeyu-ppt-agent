import {elements,first} from './ooxml.mjs';
import {absoluteNodeBounds,nodeBounds,unionBounds} from './components.mjs';

function visible(node){
 if(node.localName==='pic'||node.localName==='graphicFrame'||node.localName==='cxnSp')return true;
 if(elements(node,'t').some(n=>n.textContent.trim()))return true;
 return Boolean(first(node,'custGeom')||first(node,'solidFill')||first(node,'gradFill')||first(node,'blipFill')||first(node,'pattFill')||elements(node,'ln').some(n=>!first(n,'noFill')));
}
export function visibleNodeBounds(node){
 const leaf=[...(node.localName==='grpSp'||node.localName==='AlternateContent'?[]:[node]),...elements(node,'sp'),...elements(node,'pic'),...elements(node,'cxnSp'),...elements(node,'graphicFrame')];
 return unionBounds(leaf.filter(visible).map(absoluteNodeBounds).filter(b=>b&&b.w>=0&&b.h>=0))||nodeBounds(node);
}
export function inspectGeometry(nodes,component){
 const boxes=nodes.map(visibleNodeBounds),bounds=unionBounds(boxes)||component.bounds;
 const parent=nodes.map((_,i)=>i),root=i=>parent[i]===i?i:(parent[i]=root(parent[i])),merge=(a,b)=>{parent[root(b)]=root(a);};
 const pad=Math.min(component.width,component.height)*.012;
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=boxes[i],b=boxes[j];if(a&&b&&a.x<=b.x+b.w+pad&&b.x<=a.x+a.w+pad&&a.y<=b.y+b.h+pad&&b.y<=a.y+a.h+pad)merge(i,j);
 }
 const owner=new Map();nodes.forEach((n,i)=>elements(n,'cNvPr').forEach(p=>owner.set(p.getAttribute('id'),i)));
 for(let i=0;i<nodes.length;i++)for(const n of [...elements(nodes[i],'stCxn'),...elements(nodes[i],'endCxn')])if(owner.has(n.getAttribute('id')))merge(i,owner.get(n.getAttribute('id')));
 const groups=new Map();for(let i=0;i<nodes.length;i++){const r=root(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(i);}
 const islands=[...groups.values()].map(indices=>({nodeIndices:indices.map(i=>component.nodeIndices?.[i]),bounds:unionBounds(indices.map(i=>boxes[i])),keys:indices.flatMap(i=>elements(nodes[i],'cNvPr').map(n=>n.getAttribute('id'))),nativeObjects:indices.reduce((s,i)=>s+elements(nodes[i],'cNvPr').length,0)})).filter(v=>v.bounds).sort((a,b)=>Math.abs(a.bounds.y-b.bounds.y)<component.height*.08?a.bounds.x-b.bounds.x:a.bounds.y-b.bounds.y);
 const safe=!component.nodePaths&&islands.length>=2&&islands.length<=6&&islands.every(i=>i.nativeObjects>=2&&i.bounds.w>component.width*.10&&i.bounds.h>component.height*.05)&&islands.reduce((s,i)=>s+i.nodeIndices.length,0)===nodes.length;
 return {bounds,sourceBounds:component.bounds,aspect:+(bounds.w/Math.max(1,bounds.h)).toFixed(3),islands,reflowSafe:safe,sourceNodeCount:nodes.length,sourceNativeObjects:nodes.reduce((s,n)=>s+elements(n,'cNvPr').length,0)};
}
export function frameUsage(bounds,frame,template){
 const fw=frame.w*template.width,fh=frame.h*template.height,scale=Math.min(fw/bounds.w,fh/bounds.h);
 return {width:+(bounds.w*scale/fw).toFixed(3),height:+(bounds.h*scale/fh).toFixed(3),area:+((bounds.w*scale/fw)*(bounds.h*scale/fh)).toFixed(3)};
}
