import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {slotContract,slotTextIssues} from '../server/template-slot-contract.mjs';
import {openZip,parse,serialize,elements,first,textShape,NS,slideOrder,relPath,resolvePart,createDeck} from '../server/ooxml.mjs';
import {inspectNativeReference,validateNativeBindings} from '../server/native-layout-reference.mjs';
import {runNativeLayoutWorkflow} from '../server/native-layout-workflow.mjs';
import {duplicateMaterialPages} from '../server/material-semantics.mjs';
import {builtinAssets,dataDir} from '../server/library.mjs';
const canvas={width:12192000,height:6858000};
const root=content=>parse(`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:sld>`);
test('容量按原生几何、字号和内边距计算，不按旧示例字数；中英文与显式换行分别核查',()=>{
 const a=root(textShape(2,'短',0,0,100*12700,40*12700,20)),b=root(textShape(2,'原来示例文本非常长不应当扩大实际容量',0,0,100*12700,40*12700,20));
 const c=slotContract(elements(a,'sp')[0],canvas),other=slotContract(elements(b,'sp')[0],canvas);assert.equal(c.maxUnits,other.maxUnits);assert.equal(c.fontSizePt,20);const slot={key:'shape:2',capacity:c,maxChars:c.maxChars};assert.equal(slotTextIssues(slot,'ABCDEF'),null);assert.ok(slotTextIssues(slot,'一二三四五六'));assert.ok(slotTextIssues(slot,'一\n二'));
 const tiny=slotContract(elements(root(textShape(3,'稳',0,0,40*12700,40*12700,60)),'sp')[0],canvas);assert.equal(slotTextIssues({key:'shape:3',capacity:tiny},'稳'),null);
});
test('空白占位符继承布局里的真实位置和字号，也会成为可填写槽位',async()=>{
 const zip=await openZip(await fs.readFile(new URL('../server/base.pptx',import.meta.url))),order=await slideOrder(zip),part=order.paths[0],rels=parse(await zip.file(relPath(part)).async('string')),layout=resolvePart(part,elements(rels,'Relationship').find(r=>r.getAttribute('Type').endsWith('/slideLayout')).getAttribute('Target'));
 zip.file(part,serialize(root('<p:sp><p:nvSpPr><p:cNvPr id="9" name="空白正文"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="7"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>')));
 const ld=parse(await zip.file(layout).async('string')),shape=root(textShape(40,'示例',1000000,2000000,7000000,2000000,22)),node=elements(shape,'sp')[0],nv=first(node,'nvPr'),ph=shape.createElementNS(NS.p,'p:ph');ph.setAttribute('type','body');ph.setAttribute('idx','7');nv.appendChild(ph);first(ld,'spTree').appendChild(ld.importNode(node,true));zip.file(layout,serialize(ld));
 const ref=await inspectNativeReference(await zip.generateAsync({type:'nodebuffer'}),'空白底稿.pptx'),slot=ref.pages[0].slots.find(s=>s.key==='shape:9');assert.ok(slot);assert.equal(slot.blank,true);assert.equal(slot.fontSizePt,22);assert.equal(slot.absoluteBounds.w,7000000);assert.ok(slot.capacity.maxUnits>10);assert.equal(validateNativeBindings(ref.pages[0],[{key:slot.key,text:'根据主题填写正文'}]).length,1);
});
test('底稿正文版式可复用，完整参考稿仍限制重复；不固定12页或第11页',async t=>{
 const bytes=(await createDeck([{title:'主题',kind:'cover',bullets:[],assetId:'builtin-cover'},{title:'工作进展',kind:'content',bullets:['准备','执行','检查'],assetId:'builtin-content'}],builtinAssets,()=>{})).buffer;
 const source=await inspectNativeReference(bytes,'两页底稿.pptx'),ref={...source,sourceId:'fixture-source',templateId:'fixture-template'},id=randomUUID(),slides=Array.from({length:5},(_,i)=>({title:i===0?'主题':i===4?'谢谢观看':'阶段方案',kind:i===0?'cover':i===4?'ending':'content',templatePage:i===0||i===4?1:2,bullets:['建议执行步骤'],notes:''}));
 t.after(()=>fs.unlink(path.join(dataDir,'workflows',id+'.json')).catch(()=>{}));const body={document:'这是一份用于系统验证的项目方案，只说明准备、执行和检查，不包含任何业绩数字。',apiKey:'fixture-key',pageCount:5,styleSkillSnapshot:{templateUsage:'layout',content:'沿用真实底稿',nativeTemplate:ref}};
 const runAgent=async({role,onTool})=>{if(role==='native-layout-planner')await onTool('ppt_submit_native_plan',{title:'主题',slides});else{const p=ref.pages[slides[Number(role.split('-').pop())-1].templatePage-1];await onTool('ppt_fill_native_page',{bindings:p.slots.filter(s=>!s.fixed).map(s=>({key:s.key,text:'要点'})),charts:[]});}};
 const output=await runNativeLayoutWorkflow(body,{checkpointId:id,runAgent,saveOutput:async plan=>({id:randomUUID(),url:'/fixture',plan,pages:plan.slides.length})});assert.equal(output.pages,5);assert.deepEqual(duplicateMaterialPages(output.plan.slides),[]);assert.ok(output.plan.slides.every(s=>s.materialSnapshot.templateReusable));
 await assert.rejects(runNativeLayoutWorkflow({...body,styleSkillSnapshot:{...body.styleSkillSnapshot,templateUsage:'reference'}},{runAgent}),/完整参考稿/);
 assert.equal(duplicateMaterialPages([{materialId:'same',materialSnapshot:{sourceId:'s',page:1}},{materialId:'same',materialSnapshot:{sourceId:'s',page:1}}]).length,1);
});
