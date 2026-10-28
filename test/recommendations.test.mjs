import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {recommendMaterials,nativeChartMatches} from '../server/recommendations.mjs';
import {autoCompose} from '../server/composition.mjs';
import {rankMaterialLayouts,describeTextSlots} from '../server/material-layouts.mjs';
import {parse,elements} from '../server/ooxml.mjs';
import {readComponents} from '../server/components.mjs';
import {replacePageMaterial} from '../server/page-materials.mjs';
import {readLibrary} from '../server/library.mjs';
import {deckSchema,planDeck,requestSchema} from '../server/planner.mjs';

const layout=(i,extra={})=>({id:'layout-'+i,familyId:'family-'+i,sourceId:'source',title:'流程设计 '+i,text:'流程',tags:['process'],layout:true,scope:'full',purpose:'content',relation:'process',nativeObjects:20,bounds:{x:0,y:0,w:100,h:50},slots:[{index:0,role:'label',maxChars:20}],...extra});
const slide={title:'实施流程',subtitle:'三个工作阶段',kind:'content',visual:'process',bullets:['准备：整理资料','部署：联调验证','反馈：收集问题']};
test('菱形等短标签不按外接矩形容量塞入整段正文',()=>{
 const d=parse('<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3000000" cy="480000"/></a:xfrm><a:prstGeom prst="flowChartDecision"/></p:spPr><p:txBody><a:p><a:r><a:rPr sz="1400"/><a:t>工况数据与反馈</a:t></a:r></a:p></p:txBody></p:sp>');const slot=describeTextSlots([d.documentElement],{width:12192000,height:6858000})[0];assert.equal(slot.role,'label');assert.equal(slot.maxChars,7);
});
test('每页推荐10个不同来源页面的设计，正文不混入目录和封面',()=>{
 const items=Array.from({length:16},(_,i)=>layout(i));items.unshift(layout(99,{purpose:'agenda',relation:'parallel',text:'目录 CONTENTS'}));items.push(layout(90,{purpose:'cover',relation:'cover'}));items.push({...items[2],id:'core-2',scope:'core'});
 const out=recommendMaterials(slide,items);assert.equal(out.items.length,10);assert.equal(new Set(out.items.map(c=>c.familyId)).size,10);assert.ok(out.items.every(c=>c.purpose==='content'));assert.ok(!out.items.some(c=>c.id==='layout-99'));
});
test('默认完整组合，主体组件仅在明确选择时使用',()=>{
 const full=layout(1),core={...full,id:'core',scope:'core'};assert.equal(rankMaterialLayouts(slide,[full,core])[0].component.id,full.id);assert.equal(recommendMaterials(slide,[full,core],{materialScope:'full'}).items[0].id,full.id);
});
test('素材不足时显示真实数量，不重复填充为10个',()=>{
 const out=recommendMaterials({...slide,kind:'cover'},[layout(1,{relation:'cover',purpose:'cover'})]);assert.equal(out.items.length,1);assert.match(out.note,/仅有 1/);
});
test('统计图推荐只提供兼容图号的原生图表，不改变度量和数据',()=>{
 const s={...slide,chart:{code:'S01',records:[{x:'A',value:12}]}},bar={id:'bar',type:'chart',chartKinds:['barChart'],chartDirection:'col'},pie={id:'pie',type:'chart',chartKinds:['pieChart']};assert.equal(nativeChartMatches(s,bar),true);assert.deepEqual(recommendMaterials(s,[bar,pie]).items.map(c=>c.id),['bar']);assert.equal(s.chart.records[0].value,12);
});
test('主体优先模式增加内容可用高度，本页密度设置优先于全局',()=>{
 const template={id:'test',width:12192000,height:6858000,pages:[{}],safeArea:{x:.05,y:.16,w:.9,h:.76},theme:{}},components=[layout(1)];
 const compact=autoCompose({title:'测试',layoutDensity:'full',slides:[slide]},template,components),balanced=autoCompose({title:'测试',layoutDensity:'full',slides:[{...slide,layoutDensity:'balanced'}]},template,components);
 const a=compact.slides[0].blocks.find(b=>b.type==='component'),b=balanced.slides[0].blocks.find(b=>b.type==='component');assert.ok(a.h>b.h);assert.ok(a.y<b.y);assert.equal(a.y+a.h,.92);
});
test('替换组件只重新编排指定页，其他页保持不变',async t=>{
 const lib=await readLibrary(),template=lib.templates?.find(t=>t.id===lib.activeTemplateId),catalog=await readComponents(),component=catalog.items.find(c=>c.scope==='core'&&c.purpose==='content');if(!template||!component){t.skip('未导入主体组件');return;}
 const plan=deckSchema.parse(autoCompose({title:'替换测试',sourceText:'资料准备、部署验证、现场反馈构成实施流程。',slides:[{...slide},{...slide,title:'保留这一页'}]},template,catalog.items));
 const out=await replacePageMaterial({plan,page:0,componentId:component.id,mode:'demo'});assert.equal(out.slides[0].materialId,component.id);assert.deepEqual(out.slides[1],plan.slides[1]);assert.equal(out.sourceText,plan.sourceText);
 const agenda=catalog.items.find(c=>c.purpose==='agenda');if(agenda)await assert.rejects(()=>replacePageMaterial({plan,page:0,componentId:agenda.id,mode:'demo'}),/目录组件只用于目录页/);
});
test('用户提供的完整生成规范发送至规划模型，不只停留在设置界面',async()=>{
 const input=requestSchema.parse({document:'项目已完成导入能力建设，下一步开展试用并收集反馈。',mode:'deepseek',apiKey:'test-key',presentationPrompt:'先核查证据，再组织标题主线，素材选择服从内容表达。'});let sent;
 await planDeck(input,{fetchImpl:async(url,args)=>{sent=JSON.parse(args.body);return{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({title:'项目进展',slides:[{title:'当前结果',kind:'content',visual:'parallel',bullets:['导入能力：建设已完成']}]})}}]})};}});assert.ok(sent.messages[0].content.includes(input.presentationPrompt));
});
