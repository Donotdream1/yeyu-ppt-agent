// Generated, redistributable test materials. No private template library is needed.
import fs from 'node:fs/promises';
import {init,importPptx,builtinAssets} from '../server/library.mjs';
import {openZip,slideOrder,parse,serialize,first,textShape,NS,createDeck} from '../server/ooxml.mjs';
import {registerTemplate,indexComponents} from '../server/components.mjs';
import {indexMaterialLayouts} from '../server/material-layouts.mjs';
import {buildMaterialTagIndex} from '../server/material-tagging.mjs';
export async function prepareTestFixtures(){
 await init();const base=await fs.readFile(new URL('../server/base.pptx',import.meta.url));
 await registerTemplate(base,'Synthetic output template.pptx');
 const deck=await createDeck([{kind:'cover',title:'合成测试封面',bullets:[],assetId:'builtin-cover'},{kind:'content',title:'工作进展',bullets:[],assetId:'builtin-content'}],builtinAssets,()=>{});
 const zip=await openZip(deck.buffer),order=await slideOrder(zip),doc=parse(await zip.file(order.paths[1]).async('string')),tree=first(doc,'spTree');
 for(const node of Array.from(tree.childNodes).filter(n=>['sp','grpSp','pic','graphicFrame','cxnSp'].includes(n.localName)))tree.removeChild(node);
 const shapes=[textShape(20,'工作进展',609600,250000,10972800,600000,30,'164C78'),...['任务准备','协同执行','结果检查'].flatMap((label,i)=>[textShape(21+i*2,label,609600+i*3700000,1700000,3300000,750000,22,'164C78'),textShape(22+i*2,'明确任务与职责，记录进展并核对结果。',609600+i*3700000,2600000,3300000,2800000,18,'202020')])];
 const wrapper=parse(`<root xmlns:p="${NS.p}" xmlns:a="${NS.a}">${shapes.join('')}</root>`);for(const node of Array.from(wrapper.documentElement.childNodes))tree.appendChild(doc.importNode(node,true));zip.file(order.paths[1],serialize(doc));
 const source=await importPptx(await zip.generateAsync({type:'nodebuffer'}),'Synthetic blue material.pptx');await indexComponents(source.id);await indexMaterialLayouts(source.id);
 await buildMaterialTagIndex();return {sourceId:source.id};
}
