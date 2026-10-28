import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverablePages,buildRecoveryView,applyManualDesign} from '../server/workflow-recovery.mjs';
import {inspectPreparedDesign} from '../server/material-preflight.mjs';
import {semanticCopyIssues} from '../server/material-semantics.mjs';
import {bnaBodyArea} from '../server/bna-template.mjs';
import {composeHermesSlide} from '../server/page-layout.mjs';
const template={width:12192000,height:6858000,safeArea:{x:.03,y:.19,w:.94,h:.755},bnaProfile:{bodyArea:{x:.03,y:.19,w:.94,h:.755}},theme:{primary:'004695'}};
const c={id:'new',sourceId:'source-new',sourceName:'设计素材.pptx',page:10,layout:true,purpose:'content',relation:'parallel',scope:'full',title:'并列',text:'',tags:[],nativeObjects:2,bounds:{x:0,y:0,w:220,h:100},width:12192000,height:6858000,slots:[{index:0,key:'shape:1',role:'body',maxChars:30,required:true}]};
function checkpoint(){return {id:'task',status:'failed',updatedAt:'r1',body:{document:'原文',apiKey:'not-returned'},plan:{slides:[{title:'已完成',kind:'content',visual:'parallel',bullets:['既有事实'],materialId:'old',materialSnapshot:{...c,id:'old',sourceId:'old-source'},materialBindings:[{slot:0,text:'保留'}],adaptation:{status:'checked'}},{title:'待完成',kind:'content',visual:'parallel',bullets:['需要填充'],materialId:'failed',materialBindings:[{slot:0,text:'旧失败文案'}],adaptation:{status:'failed'},contentReview:{status:'rewrite'},blocks:[{}]}]},progress:{completedPages:[1],totalPages:2,failedPages:[{page:2,error:'素材不适配'}]},draftBindings:{1:[{slot:0,text:'已完成草稿'}],2:[{slot:0,text:'失败草稿'}]},pageErrors:[[2,{issues:['失败']}]]};}
test('人工介入只重置目标页并保留已完成页面、草稿与输入文档',async()=>{
 const old=checkpoint(),copy=structuredClone(old),next=await applyManualDesign(old,{page:2,materialId:'new',revision:'r1'},{catalog:[c],template,analyze:async v=>v});
 assert.deepEqual(old,copy);assert.deepEqual(next.plan.slides[0],old.plan.slides[0]);assert.deepEqual(next.draftBindings[1],old.draftBindings[1]);assert.equal(next.draftBindings[2],undefined);assert.equal(next.plan.slides[1].materialBindings,undefined);assert.equal(next.plan.slides[1].contentReview,undefined);assert.equal(next.plan.slides[1].manualDesign.materialId,'new');assert.deepEqual(next.progress.completedPages,[1]);assert.deepEqual(next.body,old.body);
});
test('拒绝过期选择、运行中任务和覆盖已完成页，不修改断点',async()=>{
 const cp=checkpoint(),deps={catalog:[c],template,analyze:async v=>v};
 await assert.rejects(applyManualDesign(cp,{page:2,materialId:'new',revision:'stale'},deps),/已更新/);
 await assert.rejects(applyManualDesign(cp,{page:1,materialId:'new'},deps),/已完成页面/);
 await assert.rejects(applyManualDesign({...cp,status:'running'},{page:2,materialId:'new'},deps),/仍在运行/);
 await assert.rejects(applyManualDesign(cp,{page:2,materialId:'unknown'},deps),/不匹配/);
 assert.equal(cp.plan.slides[1].materialId,'failed');
});
test('同源同页别名也不能重复使用，人工选版不绕过对象丢失与面积硬检查',async()=>{
 const cp=checkpoint(),alias={...c,id:'alias',sourceId:'old-source'},narrow={...c,id:'tiny',bounds:{x:0,y:0,w:10,h:100}};
 await assert.rejects(applyManualDesign(cp,{page:2,materialId:'alias'},{catalog:[alias],template,analyze:async v=>v}),/已用于其他页面/);
 await assert.rejects(applyManualDesign(cp,{page:2,materialId:'tiny'},{catalog:[narrow],template,analyze:async v=>v}),/主体占比/);
});
test('右侧列表返回真实来源、可选状态和软约束原因，不暴露原始凭证',async()=>{
 const cp=checkpoint(),view=await buildRecoveryView(cp,{page:2,catalog:[c],template,analyze:async v=>v});assert.equal(view.items[0].id,'new');assert.equal(view.items[0].selectable,true);assert.match(view.items[0].previewUrl,/source-new\/10.png/);assert.equal(JSON.stringify(view).includes('not-returned'),false);assert.deepEqual(recoverablePages(cp).map(p=>p.page),[2]);
 const narrow={...c,bounds:{x:0,y:0,w:160,h:100}},check=inspectPreparedDesign(cp.plan.slides[1],narrow,template,{allowSoftGeometry:true});assert.ok(check.selectable);assert.ok(check.warnings.length);
});
test('五项目录在宽度预检失败后安全重排，原生对象全部保留',()=>{
 const card={...c,purpose:'agenda',relation:'agenda',nativeObjects:10,bounds:{x:0,y:0,w:169,h:100},slots:Array.from({length:10},(_,i)=>({index:i,key:'shape:'+(i+1),fixed:i%2?null:String(i/2+1).padStart(2,'0'),role:i%2?'body':'number',maxChars:30}))};
 card.geometry={reflowSafe:true,islands:Array.from({length:5},(_,i)=>({nodeIndices:[i],keys:[String(i*2+1),String(i*2+2)],bounds:{x:i%3*50,y:Math.floor(i/3)*50,w:40,h:40},nativeObjects:2}))};
 const result=inspectPreparedDesign({title:'目录',kind:'agenda',bullets:['甲','乙','丙','丁','戊']},card,template);assert.ok(result.selectable);assert.equal(result.recipe,'reflow');assert.equal(result.layout.layoutReview.retainedObjects,10);assert.equal(result.usage.width,1);
});
test('目录允许精简章名，以关联条目检查结构，语义交由内容审校',()=>{
 const slots=[{index:0,semanticRole:'chapter-title'},{index:1,semanticRole:'chapter-summary'}],bindings=[{slot:0,text:'人防',contentIds:['u1']},{slot:1,text:'人防筑牢思想与责任防线',contentIds:['u1']}];
 assert.deepEqual(semanticCopyIssues({kind:'agenda',bullets:['人防筑牢思想与责任防线']},{slots},bindings),[]);
 bindings[0].contentIds=[];assert.ok(semanticCopyIssues({kind:'agenda',bullets:['人防筑牢思想与责任防线']},{slots},bindings).length);
});

test('内容已填完但审校未通过的页面仍能进入人工选版',async()=>{
 const cp=checkpoint();cp.progress.completedPages=[1,2];cp.progress.failedPages=[];
 const view=await buildRecoveryView(cp,{catalog:[c],template,analyze:async v=>v});
 assert.equal(view.page.number,2);assert.deepEqual(view.failedPages.map(p=>p.page),[2]);assert.deepEqual(view.completedPages,[1]);
 const next=await applyManualDesign(cp,{page:2,materialId:'new'},{catalog:[c],template,analyze:async v=>v});assert.deepEqual(next.progress.completedPages,[1]);
});

test('大字号目录为标题留出完整空间，五张原生卡片最后一行居中',()=>{
 const slide={kind:'agenda',title:'目录',bullets:['甲','乙','丙','丁','戊'],materialBindings:[],layoutRecipe:'reflow',materialSnapshot:{...c,nativeObjects:5,agendaHeading:{fontSize:54},geometry:{reflowSafe:true,islands:Array.from({length:5},(_,i)=>({nodeIndices:[i],keys:[],bounds:{x:0,y:0,w:40,h:40},nativeObjects:1}))}}};
 const body=bnaBodyArea(template,template.bnaProfile,slide),blocks=composeHermesSlide(slide,0,template).blocks.filter(b=>b.type==='component');
 assert.ok(body.y>=.105+54*1.25/540+.025);assert.ok(blocks.every(b=>b.y>=body.y));assert.equal(blocks.length,5);
 assert.ok(Math.abs((blocks[3].x+blocks[4].x+blocks[4].w)/2-(body.x+body.w/2))<1e-8);
});
