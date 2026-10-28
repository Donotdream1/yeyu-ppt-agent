import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {composeDeck} from '../server/composition.mjs';
import {drawingNodes} from '../server/components.mjs';
import {openZip,parse,serialize,elements,first,slideOrder,relPath,resolvePart,NS} from '../server/ooxml.mjs';

test('同一可编辑素材复用到多页时，Office Tags元数据部件各自独立且原样保留',async()=>{
 const base=await fs.readFile(new URL('../server/base.pptx',import.meta.url)),source=await openZip(base),order=await slideOrder(source),part=order.paths[0],doc=parse(await source.file(part).async('string'));
 const shape=parse(`<p:sp xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:nvSpPr><p:cNvPr id="700" name="私有元数据原生对象"/><p:cNvSpPr/><p:nvPr><p:custDataLst><p:tags r:id="rIdPrivateTags"/></p:custDataLst></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="100000" y="200000"/><a:ext cx="3000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="123456"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="2400"/><a:t>保留原字号</a:t></a:r></a:p></p:txBody></p:sp>`).documentElement;
 first(doc,'spTree').appendChild(doc.importNode(shape,true));const nodeIndex=drawingNodes(doc).length-1;
 source.file(part,serialize(doc));const rels=parse(await source.file(relPath(part)).async('string')),r=rels.createElementNS(NS.rel,'Relationship');r.setAttribute('Id','rIdPrivateTags');r.setAttribute('Type',NS.r+'/tags');r.setAttribute('Target','../tags/tag1.xml');rels.documentElement.appendChild(r);source.file(relPath(part),serialize(rels));
 const tagXml=`<p:tagLst xmlns:p="${NS.p}"><p:tag name="SOURCE_METADATA" val="原生元数据"/></p:tagLst>`;source.file('ppt/tags/tag1.xml',tagXml);
 const types=parse(await source.file('[Content_Types].xml').async('string')),override=types.createElementNS('http://schemas.openxmlformats.org/package/2006/content-types','Override');override.setAttribute('PartName','/ppt/tags/tag1.xml');override.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.presentationml.tags+xml');types.documentElement.appendChild(override);source.file('[Content_Types].xml',serialize(types));
 const component={id:'fixture-component',sourceId:'fixture-source',part,nodeIndices:[nodeIndex],title:'复用的原生素材',bounds:{x:100000,y:200000,w:3000000,h:1000000},width:order.width,height:order.height,nativeObjects:1,dataRisk:false};
 const template={id:'fixture-template',sourceId:'fixture-template',width:order.width,height:order.height,pages:order.paths.map((p,i)=>({page:i+1,part:p})),theme:{primary:'002060',font:'微软雅黑',text:'202020'}};
 const plan={title:'原生部件复用',slides:[1,2].map(n=>({title:'第'+n+'页',bullets:[],blocks:[{id:'source-instance-'+n,type:'component',componentId:component.id,x:.1,y:.2,w:.8,h:.6,bindText:false,colorMode:'source'}]}))};
 const sourceBytes=await source.generateAsync({type:'nodebuffer'}),out=await composeDeck(plan,template,[component],{loadSource:id=>Promise.resolve(id==='fixture-source'?sourceBytes:base)}),zip=await openZip(out.buffer),composed=await slideOrder(zip),tagParts=[];
 for(const p of composed.paths){
  const relationships=elements(parse(await zip.file(relPath(p)).async('string')),'Relationship'),tag=relationships.find(n=>n.getAttribute('Type')===NS.r+'/tags');assert.ok(tag);
  const target=resolvePart(p,tag.getAttribute('Target'));tagParts.push(target);assert.equal(await zip.file(target).async('string'),tagXml);
  const drawing=parse(await zip.file(p).async('string')),native=elements(drawing,'sp').find(n=>first(n,'cNvPr')?.getAttribute('name')==='私有元数据原生对象');assert.ok(native);assert.equal(first(native,'rPr').getAttribute('sz'),'2400');assert.equal(first(native,'srgbClr').getAttribute('val'),'123456');assert.equal(first(native,'off').getAttribute('x'),'100000');assert.equal(first(native,'ext').getAttribute('cx'),'3000000');
 }
 assert.equal(new Set(tagParts).size,2,'Office Tags部件不能被两个页面共享');
 assert.ok(tagParts.every(p=>p.includes('/instances/')));
});
