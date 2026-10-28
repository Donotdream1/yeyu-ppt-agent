import {parse,elements,first,relPath,resolvePart,NS} from './ooxml.mjs';

export async function readSourceTheme(zip,slidePart){
 let part=slidePart,themePart;
 for(let depth=0;depth<5;depth++){
  const rf=zip.file(relPath(part));if(!rf)break;const rels=elements(parse(await rf.async('string')),'Relationship');
  const theme=rels.find(r=>r.getAttribute('Type').endsWith('/theme'));if(theme){themePart=resolvePart(part,theme.getAttribute('Target'));break;}
  const parent=rels.find(r=>/\/(slideLayout|slideMaster)$/.test(r.getAttribute('Type')));if(!parent)break;part=resolvePart(part,parent.getAttribute('Target'));
 }
 themePart=themePart||Object.keys(zip.files).find(n=>/^ppt\/theme\/theme\d+\.xml$/.test(n));
 if(!themePart)return null;const doc=parse(await zip.file(themePart).async('string')),scheme=first(doc,'clrScheme'),colors={};
 for(const n of Array.from(scheme?.childNodes||[]).filter(n=>n.nodeType===1)){const c=Array.from(n.childNodes).find(c=>c.nodeType===1);if(c)colors[n.localName]=c.getAttribute('lastClr')||c.getAttribute('val');}
 colors.bg1=colors.lt1;colors.bg2=colors.lt2;colors.tx1=colors.dk1;colors.tx2=colors.dk2;
 const master=zip.file(part);if(master){const map=first(parse(await master.async('string')),'clrMap');if(map)for(const a of Array.from(map.attributes||[]))if(colors[a.value])colors[a.name]=colors[a.value];}
 const fonts=first(doc,'fontScheme');return {colors,font:first(first(fonts,'minorFont'),'ea')?.getAttribute('typeface')||first(first(fonts,'minorFont'),'latin')?.getAttribute('typeface')||'Microsoft YaHei'};
}
export function freezeSourceTheme(node,theme){
 if(!theme)return;
 for(const c of [...elements(node,'schemeClr')]){const color=theme.colors[c.getAttribute('val')];if(!/^[0-9a-f]{6}$/i.test(color||''))continue;const replacement=c.ownerDocument.createElementNS(NS.a,'a:srgbClr');replacement.setAttribute('val',color);while(c.firstChild)replacement.appendChild(c.firstChild);c.parentNode.replaceChild(replacement,c);}
 for(const key of ['latin','ea','cs'])for(const f of elements(node,key))if(/^\+/.test(f.getAttribute('typeface')||''))f.setAttribute('typeface',theme.font);
}
const direct=(node,name)=>Array.from(node?.childNodes||[]).find(n=>n.nodeType===1&&n.localName===name);
const safeFirst=(node,name)=>node?first(node,name):undefined;
const sizeOf=node=>{const size=Number(node?.getAttribute('sz'));return size>0?size:null;};
const contextCache=new WeakMap();
export async function readSourceTypography(zip,slidePart){
 let cache=contextCache.get(zip);if(!cache){cache=new Map();contextCache.set(zip,cache);}if(cache.has(slidePart))return cache.get(slidePart);
 const pending=(async()=>{
  const layers=[];let part=slidePart;
  for(let depth=0;depth<5;depth++){
   const file=zip.file(part);if(!file)break;layers.push({part,doc:parse(await file.async('string'))});
   const rf=zip.file(relPath(part));if(!rf)break;const parent=elements(parse(await rf.async('string')),'Relationship').find(r=>/\/(slideLayout|slideMaster)$/.test(r.getAttribute('Type')));
   if(!parent)break;part=resolvePart(part,parent.getAttribute('Target'));
  }
  const presentation=zip.file('ppt/presentation.xml');return {layers,defaultTextStyle:presentation?safeFirst(parse(await presentation.async('string')),'defaultTextStyle'):undefined};
 })();cache.set(slidePart,pending);pending.catch(()=>{if(cache.get(slidePart)===pending)cache.delete(slidePart);});return pending;
}
function paragraphDefault(body,index,level){
 const paragraphs=Array.from(body?.childNodes||[]).filter(n=>n.localName==='p'),paragraph=paragraphs[Math.min(index,paragraphs.length-1)];
 return sizeOf(direct(direct(paragraph,'pPr'),'defRPr'))||sizeOf(direct(direct(direct(body,'lstStyle'),'lvl'+(level+1)+'pPr'),'defRPr'));
}
function matchingPlaceholder(doc,ph){
 const placeholders=elements(doc,'sp').map(shape=>({shape,ph:safeFirst(shape,'ph')})).filter(v=>v.ph);
 const idx=ph.getAttribute('idx')||'0',type=ph.getAttribute('type')||'obj';
 return (ph.hasAttribute('idx')?placeholders.find(v=>(v.ph.getAttribute('idx')||'0')===idx)?.shape:undefined)||placeholders.find(v=>(v.ph.getAttribute('type')||'obj')===type)?.shape;
}
// Imported shapes lose their source placeholder/layout relationship. Materialize
// each inherited size before removing ph nodes, preserving explicit mixed runs.
export function freezeSourceFontSizes(node,context){
 const report=[];
 for(const body of elements(node,'txBody')){
  const owner=body.parentNode,ph=safeFirst(owner,'ph'),inherited=[];let effectiveType=ph?.getAttribute('type');
  if(ph)for(const layer of context?.layers?.slice(1)||[]){const match=matchingPlaceholder(layer.doc,ph);if(match){inherited.push(safeFirst(match,'txBody'));effectiveType=effectiveType||safeFirst(match,'ph')?.getAttribute('type');}}
  const master=context?.layers?.find(layer=>/slideMasters\//.test(layer.part))?.doc;
  const style=safeFirst(safeFirst(master,'txStyles'),/^(title|ctrTitle)$/.test(effectiveType||'')?'titleStyle':ph&&/^(body|obj|subTitle)$/.test(effectiveType||'obj')?'bodyStyle':'otherStyle');
  const paragraphs=Array.from(body.childNodes||[]).filter(n=>n.localName==='p');
  for(const [index,paragraph]of paragraphs.entries()){
   const level=Math.max(0,Math.min(8,Number(direct(paragraph,'pPr')?.getAttribute('lvl')||0)));
   const inheritedSize=paragraphDefault(body,index,level)||inherited.map(tx=>paragraphDefault(tx,index,level)).find(Boolean)||sizeOf(direct(direct(style,'lvl'+(level+1)+'pPr'),'defRPr'))||sizeOf(direct(direct(context?.defaultTextStyle,'lvl'+(level+1)+'pPr'),'defRPr'));
   const runs=Array.from(paragraph.childNodes).filter(n=>['r','fld'].includes(n.localName));
   const explicit=Array.from(new Set(runs.map(r=>sizeOf(direct(r,'rPr'))).filter(Boolean)));
   // A declared run size is an unambiguous source default for an empty tail.
   const fallback=inheritedSize||(explicit.length===1?explicit[0]:null);
   if(fallback){let props=direct(paragraph,'pPr');if(!props){props=body.ownerDocument.createElementNS(NS.a,'a:pPr');paragraph.insertBefore(props,paragraph.firstChild);}let def=direct(props,'defRPr');if(!def){def=body.ownerDocument.createElementNS(NS.a,'a:defRPr');props.appendChild(def);}if(!sizeOf(def))def.setAttribute('sz',String(fallback));}
   for(const run of runs){let prop=direct(run,'rPr');if(!prop){prop=body.ownerDocument.createElementNS(NS.a,'a:rPr');run.insertBefore(prop,run.firstChild);}if(!sizeOf(prop)&&fallback)prop.setAttribute('sz',String(fallback));}
   const ending=direct(paragraph,'endParaRPr');if(ending&&!sizeOf(ending)&&fallback)ending.setAttribute('sz',String(fallback));
   report.push({shapeId:safeFirst(owner,'cNvPr')?.getAttribute('id'),paragraph:index,resolved:Boolean(fallback||explicit.length),sizesPt:Array.from(new Set(runs.map(r=>sizeOf(direct(r,'rPr'))).filter(Boolean))).map(n=>n/100)});
  }
 }
 return report;
}
export function scaleNativeText(node,factor){
 if(!Number.isFinite(factor)||factor<=0||Math.abs(factor-1)<.001)return;
 // Group transforms resize text boxes, but PowerPoint does not scale explicit
 // point sizes from OOXML. Scale typography as well to keep the source layout.
 for(const name of ['rPr','defRPr','endParaRPr'])for(const p of elements(node,name)){const size=Number(p.getAttribute('sz'));if(size>0)p.setAttribute('sz',String(Math.max(100,Math.round(size*factor))));}
 for(const name of ['spcPts'])for(const p of elements(node,name)){const v=Number(p.getAttribute('val'));if(v>0)p.setAttribute('val',String(Math.round(v*factor)));}
}
export function scaleNativeTables(node,factor,rowFactor=factor){
 for(const table of elements(node,'tbl')){
  for(const col of elements(table,'gridCol')){const w=Number(col.getAttribute('w'));if(w>0)col.setAttribute('w',String(Math.round(w*factor)));}
  for(const row of elements(table,'tr')){const h=Number(row.getAttribute('h'));if(h>0)row.setAttribute('h',String(Math.round(h*rowFactor)));}
 }
}
