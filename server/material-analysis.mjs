import {inspectGeometry} from './material-geometry.mjs';
import {readSourceTheme,freezeSourceTheme,readSourceTypography,freezeSourceFontSizes} from './source-theme.mjs';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {openZip,parse,elements,first} from './ooxml.mjs';
import {sourceBuffer,dataDir} from './library.mjs';
import {componentNodes,drawingNodes,unionBounds,nodeBounds,absoluteNodeBounds,direct} from './components.mjs';
import {editableTextTargets,describeTextSlots} from './material-layouts.mjs';
import {isSourceAuxiliaryCaption,sourceHeaderDecorationIds,removeSourceDecorations} from './source-captions.mjs';
import {replaceTextPreservingStyles} from './typography.mjs';
import {describeSlotSemantics} from './material-semantics.mjs';

// Source IDs are content hashes. Keep immutable ZIPs and analysis promises bounded,
// while parsing a fresh DOM for each selection before resolving source theme colors.
export function createMaterialAnalysisCache({maxSources=3,maxSnapshots=256,readSource=sourceBuffer,openSource=openZip}={}){
 const sources=new Map(),snapshots=new Map();
 const remember=(map,key,limit,load)=>{
  if(map.has(key)){const hit=map.get(key);map.delete(key);map.set(key,hit);return hit;}
  const pending=Promise.resolve().then(load);map.set(key,pending);
  while(map.size>Math.max(1,limit))map.delete(map.keys().next().value);
  pending.catch(()=>{if(map.get(key)===pending)map.delete(key);});
  return pending;
 };
 return {
  source:id=>remember(sources,id,maxSources,async()=>openSource(await readSource(id))),
  snapshot:(key,load)=>remember(snapshots,key,maxSnapshots,load),
  clear:()=>{sources.clear();snapshots.clear();},
  stats:()=>({sources:sources.size,snapshots:snapshots.size}),
 };
}
const defaultAnalysisCache=createMaterialAnalysisCache();

export function slotKey(node){
 if(node.localName==='tc'){
  let frame=node.parentNode;while(frame&&frame.localName!=='graphicFrame')frame=frame.parentNode;
  const rows=Array.from(node.parentNode.parentNode.childNodes).filter(n=>n.localName==='tr');
  const cells=Array.from(node.parentNode.childNodes).filter(n=>n.localName==='tc');
  return `table:${first(frame,'cNvPr')?.getAttribute('id')}:${rows.indexOf(node.parentNode)}:${cells.indexOf(node)}`;
 }
 return `shape:${first(node,'cNvPr')?.getAttribute('id')}`;
}
export async function analyzeMaterial(component,{legacy=false,cache=defaultAnalysisCache}={}){
 const key=createHash('sha256').update(JSON.stringify({component,legacy,analysisVersion:legacy?1:2,geometryVersion:2,sourceCaptionPolicy:8,slotPolicy:legacy?'legacy':'all-editable'})).digest('hex');
 const inspect=async()=>inspectMaterial(component,{legacy,zip:cache?await cache.source(component.sourceId):await openZip(await sourceBuffer(component.sourceId))});
 // Callers mutate plan snapshots during composition; a shared result must never leak.
 return structuredClone(await (cache?cache.snapshot(key,inspect):inspect()));
}
async function inspectMaterial(component,{legacy,zip}){
 const file=zip.file(component.part);
 if(!file)throw new Error('素材源页面不存在，请重新导入素材');
 const sourceFullPage=component.layout&&component.purpose==='ending',sourceDoc=parse(await file.async('string'));
 const nodes=sourceFullPage?drawingNodes(sourceDoc):componentNodes(sourceDoc,component);
 if(nodes.some(n=>!n))throw new Error('素材版本与页面不匹配，已停止填充');
 const theme=await readSourceTheme(zip,component.part);for(const n of nodes)freezeSourceTheme(n,theme);
 const typography=await readSourceTypography(zip,component.part);for(const n of nodes)freezeSourceFontSizes(n,typography);
 const targets=nodes.flatMap(n=>editableTextTargets(n,{legacy}));
 const shapes=nodes.flatMap(n=>[...(n.localName==='sp'?[n]:[]),...elements(n,'sp')]);
 const sourceFontSizes=target=>[...new Set(elements(target,'rPr').map(p=>Number(p.getAttribute('sz'))/100).filter(v=>v>0))];
 const slots=describeTextSlots(targets,{width:component.width,height:component.height},{fontSizeOf:n=>Math.max(0,...sourceFontSizes(n))}).map((s,i)=>({...s,fontSizesPt:sourceFontSizes(targets[i]),paragraphCount:elements(targets[i],'p').length,key:slotKey(targets[i]),required:!s.fixed,groupKey:parentGroupKey(targets[i]),textColor:chooseTextColor(targets[i],shapes)}));
 for(const slot of slots){const declared=component.slots?.find(s=>s.key===slot.key);if(declared?.sourceHeaderRole||declared?.sourceheaderRole)slot.sourceHeaderRole=declared.sourceHeaderRole||declared.sourceheaderRole;}
 const agendaTitle=slots.find(s=>String(s.sample||'').trim()==='目录'),agendaHeading=agendaTitle?{fontSize:agendaTitle.font,textColor:agendaTitle.textColor,bold:elements(targets[agendaTitle.index],'rPr').some(p=>p.getAttribute('b')==='1')}:undefined;
 const suppressedSourceIds=sourceHeaderDecorationIds(nodes,component,slots),suppressed=new Set(suppressedSourceIds),sourceNativeObjects=nodes.reduce((n,v)=>n+elements(v,'cNvPr').length,0);
 for(const [i,slot]of slots.entries())if(isSourceAuxiliaryCaption(slot,component)||suppressed.has(slot.key?.replace(/^shape:/,''))){slot.decorative=true;slot.required=false;slot.sourceHeaderRole=isSourceAuxiliaryCaption(slot,component)?'auxiliary-caption':'auxiliary-icon';replaceTextPreservingStyles(targets[i].ownerDocument,targets[i],'');}
 describeSlotSemantics(slots,component);
 for(const slot of slots)if(/^[·•]$/.test(String(slot.sample).trim())&&slot.position?.h>.3){slot.decorative=true;slot.required=false;replaceTextPreservingStyles(targets[slot.index].ownerDocument,targets[slot.index],'');}
 const bodyNodes=removeSourceDecorations(nodes,suppressedSourceIds),geometryComponent={...component,nodeIndices:component.nodeIndices?bodyNodes.map(n=>component.nodeIndices[nodes.indexOf(n)]):undefined};
 const geometry=inspectGeometry(bodyNodes,geometryComponent),bounds=legacy?(unionBounds(bodyNodes.map(nodeBounds).filter(Boolean))||component.bounds):geometry.bounds;
 const count=bodyNodes.reduce((n,v)=>n+elements(v,'cNvPr').length,0);
 const snapshot={...component,sourceFullPage,agendaHeading,bounds,geometry:legacy?undefined:geometry,slots,textSlots:slots.length,nativeObjects:count,sourceNativeObjects,suppressedNativeObjects:sourceNativeObjects-count,suppressedSourceIds,structure:{groups:bodyNodes.reduce((n,v)=>n+elements(v,'grpSp').length+(v.localName==='grpSp'?1:0),0),connectors:bodyNodes.flatMap(v=>elements(v,'cxnSp')).map(n=>({from:first(n,'stCxn')?.getAttribute('id'),to:first(n,'endCxn')?.getAttribute('id')})),arrows:bodyNodes.flatMap(v=>elements(v,'prstGeom')).map(n=>n.getAttribute('prst')).filter(s=>/arrow|chevron/i.test(s)),pictures:bodyNodes.reduce((n,v)=>n+elements(v,'pic').length+(v.localName==='pic'?1:0),0)},analysisVersion:legacy?1:2,slotPolicy:legacy?'legacy':'all-editable'};
 snapshot.fingerprint=createHash('sha256').update(JSON.stringify({sourceId:component.sourceId,part:component.part,nodeIndices:component.nodeIndices,nodePaths:component.nodePaths,slots:slots.map(s=>s.key),legacy})).digest('hex').slice(0,20);
 return snapshot;
}
function parentGroupKey(node){for(let p=node.parentNode;p;p=p.parentNode)if(p.localName==='grpSp')return 'group:'+first(p,'cNvPr')?.getAttribute('id');return 'page';}
const luminance=hex=>{const v=hex.match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
function solidColor(n){const fill=direct(n,'solidFill');return fill?first(fill,'srgbClr')?.getAttribute('val'):undefined;}
function fillColor(n){return solidColor(direct(n,'spPr'));}
export function chooseTextColor(target,shapes){
 let bg=fillColor(target),box=absoluteNodeBounds(target);
 if(!bg&&box){const x=box.x+box.w/2,y=box.y+box.h/2;const behind=shapes.slice(0,shapes.indexOf(target)>=0?shapes.indexOf(target):shapes.length).map(n=>({box:absoluteNodeBounds(n),color:fillColor(n)})).filter(v=>v.color&&v.box&&v.box.x<=x&&v.box.y<=y&&v.box.x+v.box.w>=x&&v.box.y+v.box.h>=y).sort((a,b)=>a.box.w*a.box.h-b.box.w*b.box.h);bg=behind[0]?.color;}
 bg=/^[0-9a-f]{6}$/i.test(bg||'')?bg:'FFFFFF';
 const prop=first(target,'rPr')||first(target,'defRPr'),original=solidColor(prop);
 if(/^[0-9a-f]{6}$/i.test(original||'')&&contrast(original,bg)>=4.5)return original;
 return contrast('FFFFFF',bg)>contrast('23334A',bg)?'FFFFFF':'23334A';
}
export function materialSummary(c){return {fingerprint:c.fingerprint,sourceName:c.sourceName,page:c.page,scope:c.scope||'group',nativeObjects:c.nativeObjects,editableSlots:c.slots.length,requiredSlots:c.slots.filter(s=>s.required&&!s.decorative).length,decorativeSlots:c.slots.filter(s=>s.decorative).length,fixedSlots:c.slots.filter(s=>s.fixed).length,tableCells:c.slots.filter(s=>s.table).length,relation:c.relation,geometry:c.geometry?{aspect:c.geometry.aspect,reflowSafe:c.geometry.reflowSafe,islands:c.geometry.islands.length,sourceNodes:c.geometry.sourceNodeCount}:undefined,structure:c.structure,font:'微软雅黑'};}

// Older outputs retain the exact node selection in their audit. Recover it
// before a catalog refresh can reinterpret positional bindings against new nodes.
export async function pinOutputPlan(info,components){
 const plan=structuredClone(info.plan);
 for(let i=0;i<plan.slides.length;i++)for(const block of plan.slides[i].blocks||[]){
  if(block.type!=='component'||block.materialSnapshot)continue;
  let c=components.find(c=>c.id===block.componentId);if(!c)throw new Error('旧页面素材源不可用');
  const audit=info.audit?.find(a=>a.page===i+1&&a.componentId===block.componentId);
  if(audit)c={...c,...(audit.nodeIndices?{nodeIndices:audit.nodeIndices}:{}),...(audit.nodePaths?{nodePaths:audit.nodePaths}:{})};
  c=await analyzeMaterial(c,{legacy:true});
  if(block.textBindings&&block.textBindings.length!==c.slots.length)throw new Error(`第 ${i+1} 页旧素材与文字位置不一致，请重新选择该页设计`);
  block.materialSnapshot=c;
  if(block.textBindings)block.textBindings=block.textBindings.map(b=>({...b,key:c.slots[b.slot]?.key}));
  if(plan.slides[i].materialId===c.id){plan.slides[i].materialSnapshot=c;plan.slides[i].materialBindings=block.textBindings;}
 }
 return plan;
}
export async function loadPinnedPlan(id,components){
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw new Error('原文件编号无效');
 const info=JSON.parse(await fs.readFile(path.join(dataDir,'outputs',id+'.json'),'utf8'));
 return pinOutputPlan(info,components);
}
