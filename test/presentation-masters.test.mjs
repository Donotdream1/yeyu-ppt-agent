import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {openZip,parse,serialize,elements,first,NS,resolvePart} from '../server/ooxml.mjs';
import {registerPresentationMasters} from '../server/presentation-masters.mjs';
test('imported native page masters enter the presentation registry with unique layout IDs; registration is idempotent',async()=>{
 const zip=await openZip(await fs.readFile(new URL('../server/base.pptx',import.meta.url))),doc=parse(await zip.file('ppt/presentation.xml').async('string')),rels=parse(await zip.file('ppt/_rels/presentation.xml.rels').async('string')),ct=parse(await zip.file('[Content_Types].xml').async('string')),original=await zip.file('ppt/slideMasters/slideMaster1.xml').async('string'),part='ppt/component-resources/fixture/ppt/slideMasters/slideMaster1.xml';
 zip.file(part,original);const type=ct.createElementNS('http://schemas.openxmlformats.org/package/2006/content-types','Override');type.setAttribute('PartName','/'+part);type.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml');ct.documentElement.appendChild(type);
 assert.deepEqual(await registerPresentationMasters(zip,doc,rels,ct),[part]);assert.equal(elements(first(doc,'sldMasterIdLst'),'sldMasterId').length,2);assert.equal(await zip.file('ppt/slideMasters/slideMaster1.xml').async('string'),original);
 const keys=[];for(const n of elements(first(doc,'sldMasterIdLst'),'sldMasterId')){keys.push(Number(n.getAttribute('id')));const rel=elements(rels,'Relationship').find(r=>r.getAttribute('Id')===n.getAttribute('r:id'));assert.equal(rel.getAttribute('Type'),NS.r+'/slideMaster');const target=resolvePart('ppt/presentation.xml',rel.getAttribute('Target'));for(const layout of elements(parse(await zip.file(target).async('string')),'sldLayoutId'))keys.push(Number(layout.getAttribute('id')));}
 assert.equal(new Set(keys).size,keys.length);assert.ok(keys.every(n=>n>=2147483648&&n<=4294967295));const before=serialize(doc);assert.deepEqual(await registerPresentationMasters(zip,doc,rels,ct),[]);assert.equal(serialize(doc),before);
});
