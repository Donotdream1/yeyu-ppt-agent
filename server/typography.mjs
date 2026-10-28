import {parse,serialize,elements,first,NS} from './ooxml.mjs';
export const PPT_FONT='微软雅黑';
export function normalizeFonts(xml,policy){
 const doc=parse(xml);
 const face=n=>{if(!policy)return PPT_FONT;if(n.localName==='latin')return policy.latin||'Arial';if(n.localName==='font'&&n.getAttribute('script')&&!/Hans|Hant|Jpan|Hang/.test(n.getAttribute('script')))return policy.latin||'Arial';for(let p=n;p;p=p.parentNode)if(p.localName==='sp'){const name=first(p,'cNvPr')?.getAttribute('name')||'';const large=elements(p,'rPr').some(r=>Number(r.getAttribute('sz'))>=2800);return /Research:(main-title|chapter):/.test(name)||large?policy.title||'微软雅黑':policy.body||'黑体';}return policy.body||'黑体';};
 for(const name of ['latin','ea','cs','font','sym'])for(const n of elements(doc,name))if(n.hasAttribute('typeface'))n.setAttribute('typeface',face(n));
 for(const name of ['rPr','defRPr','endParaRPr'])for(const prop of elements(doc,name))for(const family of ['latin','ea','cs']){
  let node=Array.from(prop.childNodes).find(n=>n.localName===family);
  if(!node){node=doc.createElementNS(NS.a,'a:'+family);prop.appendChild(node);}node.setAttribute('typeface',face(node));
 }
 preventTextAutofit(doc);
 return serialize(doc);
}
export async function normalizeDeckFonts(zip,policy){
 for(const name of Object.keys(zip.files))if(/^ppt\/.*\.xml$/.test(name)&&!zip.files[name].dir){const xml=await zip.file(name).async('string');if(/typeface=|<(?:a:)?(?:rPr|defRPr|endParaRPr)\b/.test(xml))zip.file(name,normalizeFonts(xml,policy));}
}

const child=(node,name)=>Array.from(node?.childNodes||[]).find(n=>n.nodeType===1&&n.localName===name);
export function preventTextAutofit(node){
 for(const body of elements(node,'txBody')){
  let props=child(body,'bodyPr');if(!props){props=body.ownerDocument.createElementNS(NS.a,'a:bodyPr');body.insertBefore(props,body.firstChild);}
  // normAutofit shrinks glyphs, while spAutoFit grows the text frame at the
  // unchanged source point size. Preserve that source geometry behavior.
  for(const n of Array.from(props.childNodes))if(n.localName==='normAutofit')props.removeChild(n);
  if(!child(props,'spAutoFit')&&!child(props,'noAutofit'))props.appendChild(body.ownerDocument.createElementNS(NS.a,'a:noAutofit'));
 }
}
function splitBySourceWeights(text,weights){
 const chars=Array.from(text),total=weights.reduce((n,w)=>n+w,0);let previous=0,sum=0;
 return weights.map((weight,i)=>{sum+=weight;const end=i===weights.length-1?chars.length:total?Math.round(chars.length*sum/total):0;const value=chars.slice(previous,end).join('');previous=end;return value;});
}
// Replace copy without replacing source run sizes, paragraph spacing, or padding.
// Mixed runs keep their style sequence; inherited sizes are frozen before import.
export function replaceTextPreservingStyles(doc,node,value){
 const body=first(node,'txBody');if(!body)return;
 const paragraphs=Array.from(body.childNodes).filter(n=>n.localName==='p');if(!paragraphs.length)return;
 // Source manual line breaks may split a single word. Only the new copy's
 // explicit newlines create paragraphs; never split sentences by old lengths.
 const parts=String(value??'').replace(/\r\n?/g,'\n').split('\n');
 for(const p of paragraphs)body.removeChild(p);
 for(const [index,part] of parts.entries()){
  const source=paragraphs[Math.min(index,paragraphs.length-1)],p=source.cloneNode(true);
  const runs=Array.from(source.childNodes).filter(n=>['r','fld'].includes(n.localName));
  const styles=runs.length?runs:[doc.createElementNS(NS.a,'a:r')];
  const pieces=splitBySourceWeights(part,styles.map(r=>Array.from(elements(r,'t').map(n=>n.textContent).join('')).length));
  for(const n of Array.from(p.childNodes))if(!['pPr','endParaRPr'].includes(n.localName))p.removeChild(n);
  for(const [runIndex,prototype]of styles.entries()){
   const r=doc.createElementNS(NS.a,'a:r'),props=child(prototype,'rPr');if(props)r.appendChild(props.cloneNode(true));
   const t=doc.createElementNS(NS.a,'a:t');t.appendChild(doc.createTextNode(pieces[runIndex]));r.appendChild(t);
   p.insertBefore(r,child(p,'endParaRPr')||null);
  }
  body.appendChild(p);
 }
 preventTextAutofit(node);
}


export function applyTextColor(node,color){
 if(!/^[0-9a-f]{6}$/i.test(color||''))return;
 for(const name of ['rPr','defRPr','endParaRPr'])for(const prop of elements(node,name)){
  for(const child of Array.from(prop.childNodes))if(['solidFill','gradFill','noFill','pattFill'].includes(child.localName))prop.removeChild(child);
  const fill=prop.ownerDocument.createElementNS(NS.a,'a:solidFill'),c=prop.ownerDocument.createElementNS(NS.a,'a:srgbClr');c.setAttribute('val',color);fill.appendChild(c);prop.insertBefore(fill,Array.from(prop.childNodes).find(n=>n.nodeType===1&&n.localName!=='ln')||null);
 }
}

// Local emphasis sizes in a sample sentence do not identify characters in the
// replacement copy. Choose the source's predominant size for one logical label.
export function uniformLabelFontSize(node){
 const weights=new Map();
 for(const run of elements(node,'r')){const size=Number(first(run,'rPr')?.getAttribute('sz'))/100;if(size>0)weights.set(size,(weights.get(size)||0)+Array.from(elements(run,'t').map(t=>t.textContent).join('')).length);}
 if(weights.size<2)return undefined;
 const size=[...weights].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0];
 for(const key of ['rPr','defRPr','endParaRPr'])for(const prop of elements(node,key))prop.setAttribute('sz',String(Math.round(size*100)));
 return size;
}


export function fitMaterialText(node,slot,value,scale,component,{sx=scale,sy=scale}={}){
 // Geometry and copy are adapted to source typography; font sizes never adapt
 // to geometry. Keep this legacy entry point harmless for existing callers.
 preventTextAutofit(node);
 const sizes=['rPr','defRPr','endParaRPr'].flatMap(name=>elements(node,name)).map(n=>Number(n.getAttribute('sz'))/100).filter(n=>n>0);
 return sizes.length?Math.min(...sizes):slot?.font||null;
}
