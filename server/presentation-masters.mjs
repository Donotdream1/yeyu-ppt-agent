import path from 'node:path';
import {parse,serialize,elements,first,NS,resolvePart} from './ooxml.mjs';

// A native page may bring its own slideLayout and slideMaster. PowerPoint must
// also see that master in presentation.xml; a valid ZIP alone is insufficient.
export async function registerPresentationMasters(zip,presentation,relationships,contentTypes){
 let list=first(presentation,'sldMasterIdLst');
 if(!list){list=presentation.createElementNS(NS.p,'p:sldMasterIdLst');presentation.documentElement.insertBefore(list,presentation.documentElement.firstChild);}
 const rels=elements(relationships,'Relationship'),relById=new Map(rels.map(r=>[r.getAttribute('Id'),r])),used=new Set(),registered=new Set(),ids=new Set(rels.map(r=>r.getAttribute('Id')));
 for(const item of elements(list,'sldMasterId')){
  used.add(Number(item.getAttribute('id')));const rel=relById.get(item.getAttribute('r:id'));if(!rel)throw Error('母版列表缺少对应关系');const part=resolvePart('ppt/presentation.xml',rel.getAttribute('Target'));registered.add(part);
  const master=zip.file(part);if(!master)throw Error('母版资源缺失');for(const layout of elements(parse(await master.async('string')),'sldLayoutId'))used.add(Number(layout.getAttribute('id')));
 }
 let next=Math.max(2147483647,...used)+1,index=1;
 const allocate=()=>{if(next>4294967295)next=2147483648;while(used.has(next)){next++;if(next>4294967295)next=2147483648;}used.add(next);return String(next++);};
 const added=[];
 for(const type of elements(contentTypes,'Override').filter(n=>n.getAttribute('ContentType').endsWith('.slideMaster+xml'))){
  const part=type.getAttribute('PartName').replace(/^\//,'');if(registered.has(part))continue;const master=zip.file(part);if(!master)throw Error('导入母版资源缺失');
  let rid;do{rid='rIdImportedMaster'+index++;}while(ids.has(rid));ids.add(rid);
  const rel=relationships.createElementNS(NS.rel,'Relationship');rel.setAttribute('Id',rid);rel.setAttribute('Type',NS.r+'/slideMaster');rel.setAttribute('Target',path.posix.relative('ppt',part));relationships.documentElement.appendChild(rel);
  const entry=presentation.createElementNS(NS.p,'p:sldMasterId');entry.setAttribute('id',allocate());entry.setAttributeNS(NS.r,'r:id',rid);list.appendChild(entry);
  const doc=parse(await master.async('string'));for(const layout of elements(doc,'sldLayoutId')){const id=Number(layout.getAttribute('id'));if(!Number.isInteger(id)||id<2147483648||used.has(id))layout.setAttribute('id',allocate());else used.add(id);}zip.file(part,serialize(doc));registered.add(part);added.push(part);
 }
 return added;
}
