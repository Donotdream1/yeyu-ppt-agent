import test from 'node:test';
import assert from 'node:assert/strict';
import {createHermesSession} from '../server/hermes-workflow.mjs';
import {readComponents} from '../server/components.mjs';
import {mapPageBatches} from '../server/workflow-checkpoints.mjs';
import {summarizeHermesLog} from '../server/hermes-client.mjs';
import {pageIsComplete,pageGeometry} from '../server/hermes-parallel.mjs';
import {runPageAgents} from '../server/page-agent-pool.mjs';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {saveWorkflowCheckpoint} from '../server/workflow-checkpoints.mjs';
import {dataDir} from '../server/library.mjs';
import {resumeGeneration,jobs} from '../server/studio.mjs';

async function fixture(count=1){
 const session=await createHermesSession({document:'本任务根据文档保留原生组件，统一字体，完整展示可编辑结构与文字。',mode:'deepseek'});
 for(const name of ['presentation-style','ppt-writing','material-use'])await session.handle('skill_loaded',{name});
 await session.handle('ppt_classify_document',{family:'technical',rationale:'说明原生结构与文字处理',evidence:['本任务根据文档保留原生组件']});
 await session.handle('ppt_submit_outline',{plan:{title:'并行填充验证',slides:Array.from({length:count},(_,i)=>({title:'组件说明'+(i+1),kind:'content',visual:'parallel',bullets:['保留原生组件']}))}});
 const catalog=await readComponents(),c=catalog.items.find(c=>c.layout&&c.purpose==='content'&&!c.dataRisk&&c.slots.length>=3&&c.slots.length<10);
 const analysis=await session.handle('ppt_analyze_materials',{selections:[{page:1,materialId:c.id}]});
 // Isolated commit workers share a slot schema, not the same library source page.
 for(let i=1;i<count;i++){const snapshot=structuredClone(session.plan.slides[0].materialSnapshot);snapshot.id=`fixture-${i+1}`;snapshot.sourceId='fixture-source';snapshot.page=i+1;Object.assign(session.plan.slides[i],{materialId:snapshot.id,materialSnapshot:snapshot});}
 const slots=analysis.pages[0].slots;
 return {session,slots,bindings:slots.filter(s=>!s.fixed).map(s=>({slot:s.index,text:'原生',contentIds:['u1']}))};
}
test('页面一次提交分配和文案，失败返回具体位置，局部修复不丢其他槽位',async()=>{
 const {session,slots,bindings}=await fixture(),bad=bindings[0],max=slots[bad.slot].maxChars;
 const result=await session.handle('ppt_commit_pages',{pages:[{page:1,bindings:[{...bad,slot:String(bad.slot),text:'字'.repeat(max+1),contentIds:['unknown']}]}]});
 assert.equal(result.ok,false);assert.ok(result.errors[0].missingSlots.length);assert.deepEqual(result.errors[0].missingUnitIds,['u1']);assert.deepEqual(result.errors[0].unknownUnitIds,['unknown']);assert.equal(result.errors[0].lengthViolations[0].maxChars,max);assert.equal(session.plan.slides[0].adaptation,undefined);
 const fixed=await session.handle('ppt_commit_pages',{pages:[{page:1,bindings}]});assert.equal(fixed.ok,true);assert.equal(session.plan.slides[0].adaptation.status,'checked');
});
test('26页逐页独立提交、四页并行，一页失败时其他25页保留',async()=>{
 const {session,bindings}=await fixture(26);let active=0,peak=0,commits=0;
 const out=await runPageAgents(Array.from({length:26},(_,i)=>i+1),{concurrency:4,worker:async page=>{
  active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));
  commits++;const result=await session.handle('ppt_commit_pages',{pages:[{page,bindings:page===13?[]:bindings}]});active--;if(!result.ok)throw Error('第13页留空');return result;
 }});
 assert.equal(peak,4);assert.equal(commits,26);assert.deepEqual(out.failures[0].pages,[13]);assert.equal(out.failures.length,1);assert.equal(session.plan.slides.filter(s=>s.adaptation?.status==='checked').length,25);assert.equal(session.plan.slides[12].adaptation,undefined);assert.equal(session.trace.filter(t=>t.name==='ppt_allocate_pages').length,0);
 await session.handle('ppt_commit_pages',{pages:[{page:13,bindings}]});assert.equal(session.plan.slides.filter(s=>s.adaptation?.status==='checked').length,26);
});
test('恢复后的页面从已保存snapshot和bindings重建槽位映射，单槽修复保留其他文案',async()=>{
 const {session,bindings}=await fixture();await session.handle('ppt_commit_pages',{pages:[{page:1,bindings}]});
 const restored=await createHermesSession({document:session.input.document,mode:'deepseek',outlinePlan:structuredClone(session.plan)});for(const name of ['ppt-writing','material-use'])await restored.handle('skill_loaded',{name});
 const original=structuredClone(restored.plan.slides[0].materialBindings),slot=bindings[0].slot;
 const result=await restored.handle('ppt_commit_pages',{pages:[{page:1,bindings:[{slot,text:'更正',contentIds:['u1']}]}]});assert.equal(result.ok,true);
 assert.equal(restored.plan.slides[0].materialBindings[slot].text,'更正');assert.deepEqual(restored.plan.slides[0].materialBindings.filter(b=>b.slot!==slot),original.filter(b=>b.slot!==slot));
});
test('模型性能统计区分模型请求与工具事件，累计延迟不冒充墙钟提速',()=>{
 const m=summarizeHermesLog('API call #1 in=100 out=10 total=110 latency=1.25s cache=0\nAPI call #2 in=200 out=20 total=220 latency=2.5s cache=100\ntool x completed (0.01s, 100 chars)');
 assert.deepEqual(m,{modelRequests:2,inputTokens:300,outputTokens:30,cacheReadTokens:0,apiLatencyMs:3750});
});
test('已填文字但主体占比不足的页不能当作完成，恢复时仍需换材或安全重排',()=>{
 const c={id:'narrow',nativeObjects:1,bounds:{x:0,y:0,w:100,h:800},slots:[{index:0,key:'shape:1',maxChars:20}]},s={title:'职责',kind:'content',bullets:['原生'],materialSnapshot:c,materialBindings:[{slot:0,key:'shape:1',text:'原生',contentIds:['u1']}],adaptation:{status:'checked'},layoutRecipe:'visual'};
 const session={plan:{slides:[s],designProfile:'material'},template:{width:12192000,height:6858000,theme:{}},input:{document:'原生'},isNativeCover:()=>false};
 assert.equal(pageIsComplete(session,1),false);assert.equal(pageGeometry(session,1),null);
 s.materialSnapshot={...c,bounds:{x:0,y:0,w:240,h:100}};assert.equal(pageIsComplete(session,1),true);
});
test('图表修复只改标题，数据和单位不变，待修复图表不计作完成',async()=>{
 const {session}=await fixture();await session.handle('skill_loaded',{name:'chart-drawing'});
 const chart={code:'S01',title:'需要精简的图表标题',unit:'件',records:[{x:'A',value:3,series:'数量',sourceQuote:'A为3件'}],preparedByWorkflow:true,copyNeedsRepair:true};session.plan.slides[0].chart=structuredClone(chart);
 assert.equal(pageIsComplete(session,1),false);
 await session.handle('ppt_refine_chart_copy',{pages:[{page:1,title:'业务数量',chartTitle:'数量'}]});
 assert.equal(session.plan.slides[0].chart.title,'数量');assert.deepEqual(session.plan.slides[0].chart.records,chart.records);assert.equal(session.plan.slides[0].chart.unit,'件');assert.equal(pageIsComplete(session,1),true);
});
test('两个同时到达的续跑请求只能启动一次，避免双重调用模型',async()=>{
 const id=randomUUID();await saveWorkflowCheckpoint(id,{status:'failed',body:{document:'短文',mode:'deepseek'},progress:{totalPages:0,completedPages:[]}});
 try{
  const results=await Promise.allSettled([resumeGeneration(id),resumeGeneration(id)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/已经|仍在/);
  // Invalid short input exits before any provider request; let that task settle.
  for(let i=0;i<20&&jobs.get(id)?.status==='running';i++)await new Promise(r=>setTimeout(r,10));
 }finally{jobs.delete(id);await fs.unlink(path.join(dataDir,'workflows',id+'.json')).catch(()=>{});}
});
