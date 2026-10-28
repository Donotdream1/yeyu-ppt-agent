import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import path from 'node:path';
import {dataDir} from '../server/library.mjs';
import {storePageAsset} from '../server/page-assets.mjs';
import {composeDeck} from '../server/composition.mjs';
import {openZip,slideOrder,parse,elements,first,resolvePart,relPath} from '../server/ooxml.mjs';
import {inspectNativePage,patchNativePage,restoreNativePage,mergeNativeEdits} from '../server/native-page-editor.mjs';
import {assertOtherSlidesUnchanged} from '../server/page-edit-export.mjs';
import {validatePageProposal,withDocumentLock} from '../server/page-workspace.mjs';
import {taskSummary} from '../server/hermes-monitor.mjs';
import {placeNativeNode} from '../server/native-shape-edits.mjs';
import {absoluteNodeBounds,nodeBounds} from '../server/components.mjs';

test('Hermes监控区分逐页编辑任务并展示真实调用统计',()=>{
 const s=taskSummary({id:'fixture',body:{taskKind:'page-edit',model:'deepseek-flash'},status:'done',metrics:[{modelRequests:1},{modelRequests:2}],output:{id:'new-version'},progress:{totalPages:2,completedPages:[1,2]}});
 assert.equal(s.kind,'page-edit');assert.equal(s.modelRequests,3);assert.equal(s.outputId,'new-version');
});
test('原生图形、布局、复制与删除可组合执行，字号和其他页面不变',async()=>{
 const before=await fixture(),a=await inspectNativePage(before,0),id=a.shapes.find(s=>s.text==='可编辑原文').id;
 const firstVersion=await patchNativePage(before,0,[{type:'frame',shapeId:id,box:{x:.15,y:.3,w:.6,h:.14}},{type:'style',shapeId:id,fill:'#EDF2FC',stroke:'#1044A4',strokeWidth:1,geometry:'roundRect'},{type:'clone',shapeId:id,box:{x:.15,y:.55,w:.6,h:.14}},{type:'shape',box:{x:.8,y:.3,w:.1,h:.2},geometry:'diamond',fill:'1044A4',text:'新增',fontSize:18,textColor:'FFFFFF'}]);
 await assertOtherSlidesUnchanged(before,firstVersion,0);const inspected=await inspectNativePage(firstVersion,0),moved=inspected.shapes.find(s=>s.id===id),copy=inspected.shapes.find(s=>s.name.startsWith('PageCopy:')),added=inspected.shapes.find(s=>s.name.startsWith('PageShape:'));
 assert.ok(Math.abs(moved.box.x-.15)<.00001);assert.ok(Math.abs(moved.box.h-.14)<.00001);assert.equal(moved.geometry,'roundRect');assert.equal(moved.fill,'EDF2FC');assert.equal(moved.fontSize,24);assert.equal(added.geometry,'diamond');assert.equal(added.text,'新增');assert.equal(added.fontSize,18);assert.ok(copy);assert.equal(new Set(inspected.shapes.map(s=>s.id)).size,inspected.shapes.length);
 const after=await patchNativePage(firstVersion,0,[{type:'delete',shapeId:copy.id},{type:'text',shapeId:added.id,text:'完成'}]);await assertOtherSlidesUnchanged(before,after,0);const final=await inspectNativePage(after,0);assert.ok(!final.shapes.some(s=>s.id===copy.id));assert.ok(final.shapes.some(s=>s.text==='完成'));
});
test('组合内移动使用全页坐标，水平连接线允许零高度',()=>{
 const doc=parse('<p:sld xmlns:p="'+ 'http://schemas.openxmlformats.org/presentationml/2006/main' +'" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:spTree><p:grpSp><p:grpSpPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="400" cy="400"/><a:chOff x="0" y="0"/><a:chExt cx="200" cy="200"/></a:xfrm></p:grpSpPr><p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="50" cy="50"/></a:xfrm></p:spPr></p:sp><p:cxnSp><p:spPr><a:xfrm><a:off x="0" y="80"/><a:ext cx="50" cy="0"/></a:xfrm></p:spPr></p:cxnSp></p:grpSp></p:spTree></p:sld>');
 const node=first(doc,'sp'),line=first(doc,'cxnSp'),canvas={width:1000,height:1000};placeNativeNode(node,{x:.3,y:.4,w:.2,h:.1},canvas);assert.deepEqual(absoluteNodeBounds(node),{x:300,y:400,w:200,h:100});placeNativeNode(line,{x:.2,y:.7,w:.5,h:0},canvas);assert.equal(nodeBounds(line).h,0);assert.deepEqual(absoluteNodeBounds(line),{x:200,y:700,w:500,h:0});
});

async function fixture(){const base=await fs.readFile(new URL('../server/base.pptx',import.meta.url)),order=await slideOrder(await openZip(base)),template={id:'fixture',sourceId:'fixture',width:order.width,height:order.height,pages:order.paths.map((part,i)=>({part,page:i+1})),theme:{primary:'002060',font:'微软雅黑',text:'202020'}},plan={title:'单页测试',slides:[0,1].map(i=>({title:'第'+(i+1)+'页',bullets:['事实'],blocks:[{id:'test-text',type:'text',role:'title',text:'可编辑原文',x:.08,y:.2,w:.7,h:.12,fontSize:24}]}))};return (await composeDeck(plan,template,[],{loadSource:async()=>base})).buffer;}
test('修改原生文字时保留其他页XML、原字号和可编辑文本',async()=>{
 const before=await fixture(),a=await inspectNativePage(before,0),target=a.shapes.find(s=>s.text==='可编辑原文'),after=await patchNativePage(before,0,[{type:'text',shapeId:target.id,text:'精准修改'}]);await assertOtherSlidesUnchanged(before,after,0);const b=await inspectNativePage(after,0),changed=b.shapes.find(s=>s.id===target.id);assert.equal(changed.text,'精准修改');assert.equal(changed.fontSize,target.fontSize);
});
test('上传照片写入真实原生图片并保持比例，缺失照片权限拒绝',async()=>{
 const before=await fixture(),assetId='11111111-1111-4111-8111-111111111111',buffer=await sharp({create:{width:120,height:60,channels:3,background:'#326e91'}}).png().toBuffer(),op={type:'image',assetId,box:{x:.6,y:.4,w:.3,h:.4},fit:'contain'},readAsset=async()=>({buffer,width:120,height:60});
 await assert.rejects(patchNativePage(before,0,[op],{readAsset,allowedAssetIds:new Set()}),/本页对话/);const after=await patchNativePage(before,0,[op],{readAsset,allowedAssetIds:new Set([assetId])});await assertOtherSlidesUnchanged(before,after,0);const zip=await openZip(after),page=await inspectNativePage(after,0),photo=page.shapes.find(s=>s.type==='image');assert.ok(photo);assert.ok(Math.abs(photo.box.w*page.canvas.width/(photo.box.h*page.canvas.height)-2)<.00001);assert.deepEqual(await zip.file('ppt/media/user-'+assetId+'.png').async('nodebuffer'),buffer);
});
test('文字、照片及页码权限校验，不接收其他页对象和其他会话照片',()=>{
 const ctx={shapes:[{id:7,type:'text'}]},assetId='11111111-1111-4111-8111-111111111111';assert.throws(()=>validatePageProposal({reply:'修改',operations:[{type:'text',shapeId:8,text:'错页'}]},ctx,new Set()),/不在本页/);assert.throws(()=>validatePageProposal({reply:'修改',operations:[{type:'image',assetId,box:{x:0,y:0,w:.2,h:.2}}]},ctx,new Set()),/当前页会话/);
 assert.throws(()=>mergeNativeEdits([],[{type:'image',assetId,box:{x:.9,y:.8,w:.3,h:.3}}]),/位置超出页面/);
 const edits=mergeNativeEdits([{type:'text',shapeId:7,text:'旧',style:{bold:true}}],[{type:'text',shapeId:7,text:'新'}]);assert.equal(edits.length,1);assert.equal(edits[0].style.bold,true);
});
test('同稿提交串行合并，不同文档可独立提交',async()=>{
 let active=0,peak=0,n=0;await Promise.all(Array.from({length:4},()=>withDocumentLock('fixture-root',async()=>{active++;peak=Math.max(peak,active);const initial=n;await new Promise(r=>setImmediate(r));n=initial+1;active--;})));assert.equal(peak,1);assert.equal(n,4);
});
test('撤回一页时保留其他页面后续修改',async()=>{
 const original=await fixture(),a=await inspectNativePage(original,0),b=await inspectNativePage(original,1),firstEdit=await patchNativePage(original,0,[{type:'text',shapeId:a.shapes.find(s=>s.text==='可编辑原文').id,text:'第一页修改'}]),latest=await patchNativePage(firstEdit,1,[{type:'text',shapeId:b.shapes.find(s=>s.text==='可编辑原文').id,text:'第二页后续修改'}]),restored=await restoreNativePage(latest,original,0);await assertOtherSlidesUnchanged(latest,restored,0);assert.ok((await inspectNativePage(restored,0)).shapes.some(s=>s.text==='可编辑原文'));assert.ok((await inspectNativePage(restored,1)).shapes.some(s=>s.text==='第二页后续修改'));
});
test('页面重新组合时会重放原生修改与照片，PNG资源类型保留',async()=>{
 const base=await fs.readFile(new URL('../server/base.pptx',import.meta.url)),order=await slideOrder(await openZip(base)),template={id:'fixture',sourceId:'fixture',width:order.width,height:order.height,pages:order.paths.map((part,i)=>({part,page:i+1})),theme:{primary:'002060',font:'微软雅黑',text:'202020'}},plan={title:'重放',slides:[{title:'标题',bullets:[],blocks:[{id:'body',type:'text',role:'body',text:'原文',x:.1,y:.2,w:.5,h:.2,fontSize:24}]}]},firstDeck=await composeDeck(plan,template,[],{loadSource:async()=>base}),target=(await inspectNativePage(firstDeck.buffer,0)).shapes.find(s=>s.text==='原文');
 const png=await sharp({create:{width:80,height:40,channels:3,background:'#eee'}}).png().toBuffer(),asset=await storePageAsset(png,'测试.png','unit-test');
 try{plan.slides[0].nativeEdits=[{type:'text',shapeId:target.id,text:'重放文字'},{type:'image',assetId:asset.id,box:{x:.6,y:.3,w:.25,h:.3},fit:'contain'}];const out=await composeDeck(plan,template,[],{loadSource:async()=>base}),actual=await inspectNativePage(out.buffer,0),zip=await openZip(out.buffer);assert.ok(actual.shapes.some(s=>s.text==='重放文字'));assert.ok(actual.shapes.some(s=>s.name==='UserPhoto:'+asset.id));assert.ok(elements(parse(await zip.file('[Content_Types].xml').async('string')),'Default').some(n=>n.getAttribute('Extension')==='png'&&n.namespaceURI==='http://schemas.openxmlformats.org/package/2006/content-types'));}finally{await fs.unlink(path.join(dataDir,'page-assets',asset.id+'.png'));await fs.unlink(path.join(dataDir,'page-assets',asset.id+'.json'));}
});
