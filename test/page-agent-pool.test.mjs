import test from 'node:test';
import assert from 'node:assert/strict';
import {runPageAgents,pageScopedTools} from '../server/page-agent-pool.mjs';
import {executionOptions} from '../server/hermes-parallel.mjs';
import {HERMES_TOOLS} from '../server/hermes-workflow.mjs';

test('默认逐页处理且并发有上限，旧断点批量配置不会恢复多页共用智能体',()=>{
 const old=process.env.HERMES_CONCURRENCY;delete process.env.HERMES_CONCURRENCY;
 try{assert.equal(executionOptions({}).concurrency,4);assert.equal(executionOptions({batchSize:3}).batchSize,1);assert.equal(executionOptions({concurrency:99}).concurrency,6);assert.equal(executionOptions({concurrency:0}).concurrency,1);}finally{if(old===undefined)delete process.env.HERMES_CONCURRENCY;else process.env.HERMES_CONCURRENCY=old;}
});

test('独立页同时运行，单页失败不影响其他页完成，已完成页不重复调用',async()=>{
 const completed=new Set([1]),seen=[],events=[],gates=[];let active=0,peak=0,release;
 const barrier=new Promise(r=>{release=r;});
 const job=runPageAgents([1,2,3,4,5,6,7],{concurrency:4,isComplete:n=>completed.has(n),onProgress:p=>events.push(structuredClone(p)),worker:async(page,{role})=>{
  seen.push(page);assert.equal(role,`writer-page-${page}`);active++;peak=Math.max(peak,active);gates.push(page);if(gates.length===4)release();await barrier;await new Promise(r=>setImmediate(r));active--;
  if(page===3)throw Error('本页容量不匹配');completed.add(page);return {page};
 }});
 const result=await job;assert.equal(peak,4);assert.equal(seen.includes(1),false);assert.equal(new Set(seen).size,6);assert.deepEqual(result.failures.map(f=>f.pages),[[3]]);assert.deepEqual([...completed].sort(),[1,2,4,5,6,7]);
 assert.ok(events.some(e=>e.workers.filter(w=>w.pages.length).length===4));assert.ok(events.every(e=>e.workers.every(w=>w.pages.length<=1)));assert.ok(events.some(e=>e.workers.some(w=>w.id==='writer-page-4')));
 const retry=[];await runPageAgents([1,2,3,4,5,6,7],{isComplete:n=>completed.has(n),worker:async n=>retry.push(n)});assert.deepEqual(retry,[3]);
});

test('一页一工具边界，不能提交相邻页，也不修改共享工具定义',()=>{
 const source=[{name:'commit',parameters:{properties:{pages:{type:'array',items:{type:'object',properties:{page:{type:'integer'},bindings:{type:'array'}}}}}}}],before=structuredClone(source),tools=pageScopedTools(source,7),pages=tools[0].parameters.properties.pages;
 assert.equal(pages.minItems,1);assert.equal(pages.maxItems,1);assert.deepEqual(pages.items.properties.page.enum,[7]);assert.deepEqual(source,before);
 assert.throws(()=>pageScopedTools([{parameters:{}}],1),/页码边界/);
});

test('拒绝重复页码，不启动两个智能体覆盖同一页',async()=>{
 let calls=0;await assert.rejects(runPageAgents([2,2],{worker:()=>calls++}),/不重复/);await assert.rejects(runPageAgents([0],{worker:()=>calls++}),/有效页码/);assert.equal(calls,0);
});

test('真实写作、科研和图表工具都带单页约束，保留原绑定与样式字段',()=>{
 const names=['ppt_commit_pages','ppt_research_pages','ppt_refine_chart_copy'],tools=pageScopedTools(HERMES_TOOLS.filter(t=>names.includes(t.name)),9);assert.equal(tools.length,3);
 for(const tool of tools){const pages=tool.parameters.properties.pages;assert.deepEqual(pages.items.properties.page.enum,[9]);assert.equal(pages.maxItems,1);}
 assert.ok(tools.find(t=>t.name==='ppt_commit_pages').parameters.properties.pages.items.properties.bindings);
});
