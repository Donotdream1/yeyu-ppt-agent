import {elements,first} from './ooxml.mjs';
import {absoluteNodeBounds,direct} from './components.mjs';
const agendaComponent=c=>c.purpose==='agenda'||c.relation==='agenda'||c.pageTags?.purpose?.main==='目录';

// Confirmed template page furniture, never a generic "top-right means delete"
// heuristic. Keys are tied to the immutable content-hash source and source page.
const referenceHeaders=new Map([[2,'shape:10'],[4,'shape:7'],[5,'shape:13'],[6,'shape:8'],[7,'shape:13'],[9,'shape:7'],[10,'shape:41'],[11,'shape:10'],[14,'shape:15'],[15,'shape:10']]);
export function isSourceAuxiliaryCaption(slot,component={}){
 const p=slot?.position;if(!p||slot.table||String(slot.key||'').startsWith('table:'))return false;
 if(component.purpose==='ending'&&/^(?:YOUR LOGO|LAO NIAO POWERPOINT|WORK REPORT)$/i.test(String(slot.sample||'').trim()))return true;
 if(agendaComponent(component)&&String(slot.sample||'').replace(/\s+/g,'')==='目录')return true;
 if(agendaComponent(component)&&/^(?:CONTENTS?|Enter your title)$/i.test(String(slot.sample||'').trim()))return true;
 if(!(p.x>=.6&&p.y>=0&&p.y<.14&&p.w>=.1&&p.h>0&&p.h<=.12))return false;
 const declared=slot.sourceHeaderRole||slot.sourceheaderRole||component.sourceHeaderRoles?.[slot.key];
 if(['auxiliary-caption','auxiliary','decorative'].includes(declared))return true;
 if(component.sourceId==='4ecc6a40eb3ee44a'&&referenceHeaders.get(Number(component.page))===slot.key)return true;
 const sample=String(slot.sample||'').replace(/\s+/g,'');
 return /^(?:高端工作汇报(?:PPT)?(?:HighendWorkReport(?:PPT)?)?|HighendWorkReport(?:PPT)?|PowerpointTemplate)$/i.test(sample);
}
export const isDecorativeSourceSlot=(slot,component)=>Boolean(slot?.decorative||isSourceAuxiliaryCaption(slot,component));
export const contentSlots=component=>(component.slots||[]).filter(slot=>!isDecorativeSourceSlot(slot,component));

const drawingTypes=new Set(['sp','grpSp','pic','cxnSp','graphicFrame']);
export function sourceHeaderDecorationIds(nodes,component,slots){
 const captions=slots.filter(slot=>isSourceAuxiliaryCaption(slot,component)),ids=new Set(component.suppressedSourceIds||[]);
 if(agendaComponent(component))for(const caption of captions.filter(s=>String(s.sample).trim()==='目录'))for(const root of nodes){
  if(root.localName!=='sp'||elements(root,'t').some(t=>t.textContent.trim()))continue;const b=absoluteNodeBounds(root),p=caption.position;if(!b||!p)continue;
  const q={x:b.x/component.width,y:b.y/component.height,w:b.w/component.width,h:b.h/component.height};
  if(q.w>0&&q.w<.02&&q.h>.08&&q.h<.25&&Math.abs(q.x-p.x)<.035&&q.y<p.y+p.h&&q.y+q.h>p.y)ids.add(first(root,'cNvPr').getAttribute('id'));
 }
 // The confirmed source header has a matching short underline at the left.
 // It is template furniture, not a data line or a connector inside the diagram.
 if(captions.length)for(const root of nodes){
  if(root.localName!=='sp'||elements(root,'t').some(t=>t.textContent.trim())||first(root,'prstGeom')?.getAttribute('prst')!=='rect')continue;
  const b=absoluteNodeBounds(root),xf=direct(direct(root,'spPr'),'xfrm');if(!b||Number(xf?.getAttribute('rot')||0))continue;
  if(b.x/component.width>=.03&&b.x/component.width<=.08&&b.y/component.height>=.13&&b.y/component.height<=.17&&b.w/component.width>=.06&&b.w/component.width<=.14&&b.h/component.height>0&&b.h/component.height<=.012)ids.add(first(root,'cNvPr').getAttribute('id'));
 }
 for(const caption of captions){
  const key=caption.key?.match(/^shape:(.+)$/);if(key)ids.add(key[1]);
  const p=caption.position;
  for(const root of nodes)for(const node of [root,...elements(root,'grpSp'),...elements(root,'sp'),...elements(root,'pic')]){
   const b=absoluteNodeBounds(node);if(!b)continue;
   const q={x:b.x/component.width,y:b.y/component.height,w:b.w/component.width,h:b.h/component.height};
   const overlap=Math.max(0,Math.min(q.y+q.h,p.y+p.h)-Math.max(q.y,p.y));
   // Only compact source artwork immediately to the LEFT of a confirmed
   // template caption. A column heading by itself never activates this rule.
   if(q.x>=p.x-.12&&q.x+q.w<=p.x+.015&&q.y>=p.y-.025&&q.y+q.h<=p.y+p.h+.025&&q.w>0&&q.w<=.12&&q.h>0&&q.h<=.14&&overlap/q.h>=.5){
    for(const nv of elements(node,'cNvPr'))ids.add(nv.getAttribute('id'));
   }
  }
 }
 return [...ids];
}
// Work on fresh DOM nodes only: callers must clone nodes from a cached source.
export function removeSourceDecorations(nodes,sourceIds=[]){
 const ids=new Set(sourceIds);
 function keep(node){
  if(drawingTypes.has(node.localName)&&ids.has(first(node,'cNvPr')?.getAttribute('id')))return false;
  for(const child of Array.from(node.childNodes||[]))if(drawingTypes.has(child.localName)&&!keep(child))node.removeChild(child);
  return true;
 }
 return nodes.filter(keep);
}
