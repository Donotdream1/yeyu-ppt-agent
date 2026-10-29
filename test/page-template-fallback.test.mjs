import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createDeck,openZip,slideOrder,parse,serialize,first,elements,textShape,NS} from '../server/ooxml.mjs';
import {builtinAssets,dataDir,importPptx,readLibrary} from '../server/library.mjs';
import {generatePageTemplate} from '../server/page-template-fallback.mjs';

test('no matching page: Hermes generates a private editable template from real source modules without changing pt sizes or palette',async()=>{
 const original=await createDeck([{title:'fixture',kind:'content',bullets:[],assetId:'builtin-content'}],builtinAssets,()=>{}),zip=await openZip(original.buffer),order=await slideOrder(zip),doc=parse(await zip.file(order.paths[0]).async('string')),tree=first(doc,'spTree');
 for(const node of Array.from(tree.childNodes).filter(n=>['sp','grpSp','pic','graphicFrame','cxnSp'].includes(n.localName)))tree.removeChild(node);
 const shapes=[textShape(11,'原始小标题',600000,500000,9000000,700000,22,'345678'),textShape(12,'源模板业务示例，不能成为用户文档事实。',600000,1400000,9000000,4000000,18,'345678')],wrapper=parse(`<root xmlns:p="${NS.p}" xmlns:a="${NS.a}">${shapes.join('')}</root>`);for(const n of Array.from(wrapper.documentElement.childNodes))tree.appendChild(doc.importNode(n,true));zip.file(order.paths[0],serialize(doc));
 const source=await importPptx(await zip.generateAsync({type:'nodebuffer'}),'Synthetic template module.pptx'),seed={id:'synthetic-card',sourceId:source.id,sourceName:'Synthetic template module.pptx',page:1,part:order.paths[0],width:order.width,height:order.height,bounds:{x:600000,y:500000,w:9000000,h:4900000},nodeIndices:[0,1],type:'group',editable:true,textSlots:2,nativeObjects:2},before=JSON.stringify(await readLibrary());
 let calls=0;const result=await generatePageTemplate({title:'后续方向',kind:'content',visual:'parallel',bullets:['质量：建立检验记录','设备：完善维护计划','人才：开展岗位培训']},{components:[seed],sourceId:source.id,template:{id:'frame',width:order.width,height:order.height,theme:{primary:'345678',text:'202020'},safeArea:{x:.04,y:.12,w:.92,h:.84}},runAgent:async o=>{calls++;await o.onTool('ppt_design_page_template',{componentId:seed.id,arrangement:'grid',reason:'三个模块分别表达三项后续工作，复用源配色与文本层级。'});}});
 assert.equal(calls,1);assert.equal(result.component.generatedTemplate.moduleCount,3);assert.equal(result.component.slots.filter(s=>!s.decorative).length,6);assert.equal(JSON.stringify(await readLibrary()),before);assert.ok(result.layout.layoutReview.materialUsage.area>=.52);
 const output=await openZip(await fs.readFile(path.join(dataDir,'sources',result.component.sourceId+'.pptx'))),generated=parse(await output.file(result.component.part).async('string')),text=elements(generated,'t').map(n=>n.textContent).join('');assert.ok(!text.includes('原始小标题'));assert.ok(!text.includes('源模板业务示例'));
 const sizes=new Set(elements(generated,'rPr').map(n=>n.getAttribute('sz')).filter(Boolean));assert.ok(sizes.has('2200'));assert.ok(sizes.has('1800'));assert.ok(elements(generated,'srgbClr').some(n=>n.getAttribute('val')==='345678'));
 await assert.rejects(generatePageTemplate({title:'后续方向',kind:'content',bullets:['内容']},{components:[seed],sourceId:'missing',template:{}}),/缺少可重组/);
});
