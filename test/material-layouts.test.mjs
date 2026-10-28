import test from 'node:test';
import assert from 'node:assert/strict';
import {rankMaterialLayouts,editableTextTargets} from '../server/material-layouts.mjs';
import {designWithMaterials} from '../server/designer.mjs';
import {parse,elements,openZip,slideOrder} from '../server/ooxml.mjs';
import {composeDeck,autoCompose} from '../server/composition.mjs';
import {readComponents} from '../server/components.mjs';
import {readLibrary} from '../server/library.mjs';
import {normalizeModelPlan,deckSchema} from '../server/planner.mjs';
import {freezeSourceTheme,scaleNativeText,scaleNativeTables} from '../server/source-theme.mjs';
test('原生表格缩放同时调整列宽与行高，避免越界和注释重叠',()=>{
 const d=parse('<root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:tbl><a:tblGrid><a:gridCol w="2000000"/><a:gridCol w="4000000"/></a:tblGrid><a:tr h="1000000"/></a:tbl></root>');scaleNativeTables(d,.75);assert.deepEqual(elements(d,'gridCol').map(n=>+n.getAttribute('w')),[1500000,3000000]);assert.equal(elements(d,'tr')[0].getAttribute('h'),'750000');
});
import {ensureVisualCoverage} from '../server/content-coverage.mjs';
test('自动规划保留原文明确给出的反馈闭环，指定页数时不擅自加页',()=>{
 const p={title:'测试',slides:[{title:'收益',kind:'content',bullets:[]},{title:'结语',kind:'ending',bullets:[]}]},doc='形成“部署—反馈—优化—再部署”的良性循环。';const out=ensureVisualCoverage(p,doc);assert.equal(out.slides[1].visual,'cycle');assert.deepEqual(out.slides[1].bullets,['部署','反馈','优化','再部署']);assert.equal(ensureVisualCoverage(p,doc,{pageCount:2}).slides.length,2);
});
test('跨模板复制保留素材主题色与颜色变换，并随组合缩放字号',()=>{
 const d=parse('<root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:solidFill><a:schemeClr val="accent1"><a:alpha val="50000"/></a:schemeClr></a:solidFill><a:rPr sz="2600"/></root>');freezeSourceTheme(d,{colors:{accent1:'3366AA'}});scaleNativeText(d,.75);assert.equal(elements(d,'srgbClr')[0].getAttribute('val'),'3366AA');assert.equal(elements(d,'alpha')[0].getAttribute('val'),'50000');assert.equal(elements(d,'rPr')[0].getAttribute('sz'),'1950');
});
test('模型漏填正文槽时自动补全，不导出只有表头的空页面',async()=>{
 const c={id:'material',sourceId:'ref',sourceName:'素材',page:1,title:'完整组合',text:'',tags:[],layout:true,relation:'parallel',nativeObjects:8,slots:[{index:0,role:'label',maxChars:10},{index:1,role:'body',maxChars:30}]};let calls=0;
 const out=await designWithMaterials({title:'文档',slides:[{title:'工作',kind:'content',visual:'parallel',bullets:['主体：职责']}]},[c],{mode:'deepseek',apiKey:'key',document:'主体承担对应职责。'},{fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({pages:[{page:1,materialId:c.id,...(calls===0?{assignments:[{slot:0,contentIds:['u1']},{slot:1,contentIds:['u1']}]}:{}),bindings:++calls===2?[{slot:0,text:'主体'}]:[{slot:0,text:'主体'},{slot:1,text:'承担对应职责'}]}]})}}]})})});assert.equal(calls,3);assert.equal(out.slides[0].materialBindings[1].text,'承担对应职责');
});
test('模型将时间轴或中心关系误写为页面类别时，规范为正文并保留视觉关系',()=>{
 const p=normalizeModelPlan({title:'测试',slides:[{title:'历程',kind:'timeline',bullets:['部署']},{title:'协同',kind:'hub',bullets:['四方']}]});assert.equal(deckSchema.parse(p).slides[0].kind,'content');assert.equal(p.slides[0].visual,'timeline');assert.equal(p.slides[1].visual,'hub');
});

test('完整图解检索允许多个标题与说明框，不再要求文字框数等于要点数',()=>{
 const c={id:'source-1-layout',title:'模型与平台分离架构',text:'标准接口',tags:['architecture'],layout:true,relation:'architecture',dataRisk:false,nativeObjects:22,sourceId:'ref',slots:Array.from({length:16},(_,index)=>({index,role:'body',maxChars:80}))};
 const ranked=rankMaterialLayouts({title:'模型库与运行平台',visual:'architecture',bullets:['模型库：计算','运行平台：部署']},[c],{referenceId:'ref'});assert.equal(ranked[0].component.id,c.id);
});
test('图解文案设计使用候选原生素材 ID，并逐槽绑定新内容',async()=>{
 const c={id:'material-1',title:'左右架构',sourceName:'test.pptx',page:1,text:'旧示例',tags:['architecture'],layout:true,relation:'architecture',nativeObjects:10,sourceId:'ref',slots:[{index:0,role:'label',maxChars:10,sample:'旧业务'},{index:1,role:'body',maxChars:40,sample:'旧说明'}]};
 const plan={title:'新主题',slides:[{title:'模型与平台',visual:'architecture',kind:'content',bullets:['模型：计算','平台：集成']}]};
 let request;const out=await designWithMaterials(plan,[c],{apiKey:'test-key',mode:'deepseek',document:'模型负责计算，平台负责集成。'},{fetchImpl:async(url,args)=>{request=JSON.parse(args.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({pages:[{page:1,materialId:c.id,assignments:[{slot:0,contentIds:['u1']},{slot:1,contentIds:['u2']}],bindings:[{slot:0,text:'核心模型'},{slot:1,text:'模型负责计算，平台负责集成'}]}]})}}]})};}});
 assert.doesNotMatch(request.messages[1].content,/旧业务|旧说明/,'素材示例业务文字不应混入文档文案上下文');assert.equal(out.slides[0].materialId,c.id);assert.equal(out.slides[0].materialBindings[1].text,'模型负责计算，平台负责集成');
});
test('原生表格的单元格文字参与重写，清除素材旧数据并保持表格结构',async t=>{
 const library=await readLibrary(),template=library.templates?.find(t=>t.id===library.activeTemplateId),catalog=await readComponents(),table=catalog.items.find(c=>c.layout&&c.tableBinding);if(!template||!table){t.skip('未索引完整表格组合');return;}
 const bindings=table.slots.map((s,i)=>({slot:i,text:s.fixed||`新内容${i+1}`}));
 const plan=autoCompose({title:'表格重写',slides:[{title:'表格重写',kind:'content',visual:'matrix',bullets:['主体：职责'],materialId:table.id,materialBindings:bindings}]},template,catalog.items),out=await composeDeck(plan,{...template,pageChrome:undefined},catalog.items),zip=await openZip(out.buffer),order=await slideOrder(zip),doc=parse(await zip.file(order.paths[0]).async('string'));
 assert.ok(elements(doc,'tbl').length);assert.match(elements(doc,'t').map(n=>n.textContent).join(' '),/新内容/);assert.ok(out.audit.some(a=>a.layout&&a.textBound));assert.equal(out.warnings.length,0);
 const group=elements(doc,'grpSp').find(g=>elements(g,'tc').some(n=>/^新内容\d+$/.test(elements(n,'t').map(t=>t.textContent).join(''))));assert.ok(group);
});
