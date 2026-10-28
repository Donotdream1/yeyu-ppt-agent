import test from 'node:test';
import assert from 'node:assert/strict';
import {compactVisualFeatures,writerPageContext,partitionWritingPages,executionSummary,storyboardTool} from '../server/workflow-prompts.mjs';
import {mapPageBatches} from '../server/workflow-checkpoints.mjs';
import {summarizeHermesLog} from '../server/hermes-client.mjs';
import {retryNativeInspection} from '../server/native-text-fit.mjs';
import {createHermesSession} from '../server/hermes-workflow.mjs';

test('指定页数写入规划工具约束，封面和结尾计入总数且不影响其他任务',()=>{
 const exact=storyboardTool(14).parameters.properties.plan.properties.slides,auto=storyboardTool().parameters.properties.plan.properties.slides;
 assert.equal(exact.minItems,14);assert.equal(exact.maxItems,14);assert.equal(auto.minItems,3);assert.equal(auto.maxItems,30);
 assert.match(storyboardTool(14).description,/including cover, agenda and ending/);
 assert.equal(storyboardTool(11,{maxSections:6}).parameters.properties.plan.properties.slides.items.properties.sectionIndex.maximum,5);
});

test('大纲拒绝提供实际页数与具体差额，避免模型盲目重复提交',async()=>{
 const document='本报告介绍设备维护机制与协同流程，重点说明职责、排查与验证结果。',s=await createHermesSession({document,pageCount:4});
 for(const name of ['presentation-style','ppt-writing'])await s.handle('skill_loaded',{name});
 await s.handle('ppt_classify_document',{family:'technical',rationale:'介绍设备维护协同流程',evidence:['本报告介绍设备维护机制与协同流程']});
 await assert.rejects(s.handle('ppt_submit_outline',{plan:{title:'设备维护',slides:Array.from({length:3},(_,i)=>({title:'机制'+i,kind:'content',bullets:['职责与排查']}))}}),/要求 4 页.*实际提交 3 页.*增加 1 页/);
});

test('视觉摘要移除逐槽坐标但保留关系、字体、角色数量和容量，明显减少输入',()=>{
 const source={relation:'parallel',sourceAspect:2.2,textColumns:3,slots:30,groups:4,sourceFontSizes:[14,18],roleCounts:{label:6,body:24},slotPositions:Array.from({length:30},(_,i)=>({slot:i,role:'body',group:'g'+i,position:{x:.1,y:.2,w:.3,h:.2},fontPt:14,maxChars:40,fixed:null}))},out=compactVisualFeatures(source);
 assert.equal(out.relation,'parallel');assert.deepEqual(out.sourceFontSizes,[14,18]);assert.equal(out.capacity.total,1200);assert.equal(out.slotPositions,undefined);assert.ok(JSON.stringify(out).length<JSON.stringify(source).length*.2);
});

function session(){const slots=[{index:0,key:'shape:0',fixed:'01',maxChars:2},{index:1,key:'shape:1',role:'label',maxChars:4,fontSizesPt:[18]},{index:2,key:'shape:2',role:'body',maxChars:45,fontSizesPt:[14]},{index:3,key:'shape:3',decorative:true,maxChars:30}];return {plan:{slides:[{title:'任务',bullets:['完成12项任务','保持设备稳定'],materialSnapshot:{slots},materialBindings:[{slot:1,text:'目标',contentIds:['u1']},{slot:2,text:'完成12项任务并保持稳定',contentIds:['u1','u2']}]}]},drafts:{}};}
test('写作上下文仅含可编辑内容槽，建议长度有余量且原字号保留',()=>{
 const context=writerPageContext(session(),1);assert.deepEqual(context.slots.map(s=>s.index),[1,2]);assert.deepEqual(context.slots[1].fontSizesPt,[14]);assert.equal(context.slots[0].targetChars,4);assert.ok(context.slots[1].targetChars<45);assert.ok(context.units[0].text.includes('12'));
});
test('修复超长位置只发送对应槽和草稿，不重写已通过位置；数值缺失按u关联定位',()=>{
 const s=session(),context=writerPageContext(s,1,[{page:1,lengthViolations:[{slot:2,maxChars:45}],issues:['位置 2 超过 45 字']}]);
 assert.equal(context.mode,'repair');assert.deepEqual(context.repairSlots,[2]);assert.deepEqual(context.previousBindings.map(b=>b.slot),[2]);assert.deepEqual(context.slots.map(v=>v.index),[2]);
 const numeric=writerPageContext(s,1,[{page:1,issues:['要点 u2 数值 12 未保留']}]);assert.deepEqual(numeric.repairSlots,[2]);
});
test('内容量决定批次，复杂页单独处理，页面顺序和覆盖保持完整',async()=>{
 const s=session();s.plan.slides=Array.from({length:6},(_,i)=>({bullets:['事实'],materialSnapshot:{slots:Array.from({length:i===2?45:12},()=>({}))}}));
 const batches=partitionWritingPages(s,[1,2,3,4,5,6]);assert.deepEqual(batches,[[1,2],[3],[4,5,6]]);
 const seen=[],out=await mapPageBatches([1,2,3,4,5,6],{batches,concurrency:2,worker:async pages=>{seen.push(...pages);return pages;}});assert.equal(out.failures.length,0);assert.deepEqual(seen.sort((a,b)=>a-b),[1,2,3,4,5,6]);
 await assert.rejects(mapPageBatches([1,2],{batches:[[1],[1]],worker:async()=>{throw Error('不应执行');}}),/遗漏或重复/);
});
test('实际调用和缓存令牌统计来自日志，保留跨轮累计时间的完整性标志',()=>{
 const m=summarizeHermesLog('API call #1: in=1000 out=80 latency=1.2s cache=600/1000 (60%)\nAPI call #2: in=1100 out=50 latency=0.8s cache=1000/1100 (91%)');assert.equal(m.modelRequests,2);assert.equal(m.cacheReadTokens,1600);assert.equal(m.inputTokens,2100);
 const out=executionSummary([m],{totalActiveMs:20000,stageMs:{writing:13000},historyComplete:false});assert.equal(out.activeElapsedMs,20000);assert.equal(out.historyComplete,false);assert.equal(out.modelRequests,2);
});

test('Office临时不可用只重试一次，文字溢出和超时不盲目重试',async()=>{
 let calls=0,retries=0;const result=await retryNativeInspection(async()=>{if(++calls===1)throw Object.assign(Error('busy'),{code:'OFFICE_CHECK_UNAVAILABLE'});return [];},{wait:async()=>{},onRetry:()=>retries++});assert.deepEqual(result,[]);assert.equal(calls,2);assert.equal(retries,1);
 calls=0;await assert.rejects(retryNativeInspection(async()=>{calls++;throw Object.assign(Error('still busy'),{code:'OFFICE_CHECK_UNAVAILABLE'});},{wait:async()=>{}}),/still busy/);assert.equal(calls,2);
 calls=0;await assert.rejects(retryNativeInspection(async()=>{calls++;throw Error('文字溢出');},{wait:async()=>{throw Error('不应等待');}}),/文字溢出/);assert.equal(calls,1);
});
