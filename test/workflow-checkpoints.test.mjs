import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {dataDir} from '../server/library.mjs';
import {saveWorkflowCheckpoint,loadWorkflowCheckpoint,publicWorkflowJob,mapPageBatches} from '../server/workflow-checkpoints.mjs';

test('工作流断点原子保存、恢复，并移除递归凭据及公开接口内部字段',async t=>{
 const id=randomUUID(),file=path.join(dataDir,'workflows',id+'.json');
 t.after(()=>fs.unlink(file).catch(()=>{}));
 const key='sk-fixture-12345',header='Bearer secret-header-token';
 const saved=await saveWorkflowCheckpoint(id,{status:'failed',resumable:true,phase:'写作',body:{document:'源文档',apiKey:key,headers:{Authorization:header},nested:[{DEEPSEEK_API_KEY:'deepseek-secret',api_key:'nested-secret'}]},plan:{title:'计划',slides:[{title:'已完成页'}]},progress:{completedPages:1},error:'不能保存 '+key+' '+header,privateField:'internal'});
 const text=await fs.readFile(file,'utf8');for(const secret of [key,header,'deepseek-secret','nested-secret','secret-header-token'])assert.equal(text.includes(secret),false);
 assert.equal(/apiKey|Authorization|DEEPSEEK_API_KEY|api_key/.test(text),false);
 const restored=await loadWorkflowCheckpoint(id);assert.equal(restored.plan.slides[0].title,'已完成页');assert.equal(restored.progress.completedPages,1);assert.equal(restored.id,id);assert.equal(restored.createdAt,saved.createdAt);
 const published=publicWorkflowJob(restored);assert.equal(published.body,undefined);assert.equal(published.privateField,undefined);assert.equal(published.resumable,true);assert.equal(published.checkpointId,id);
});

test('同一断点并发提交按调用顺序保存完整快照，不留下临时文件',async t=>{
 const id=randomUUID(),file=path.join(dataDir,'workflows',id+'.json');t.after(()=>fs.unlink(file).catch(()=>{}));
 const saved=await Promise.all(Array.from({length:12},(_,n)=>saveWorkflowCheckpoint(id,{status:'running',progress:{completedPages:n},sequence:n})));
 const restored=await loadWorkflowCheckpoint(id);assert.equal(restored.sequence,11);assert.equal(restored.progress.completedPages,11);assert.equal(new Set(saved.map(s=>s.createdAt)).size,1);
 const names=await fs.readdir(path.dirname(file));assert.deepEqual(names.filter(n=>n.startsWith(id)&&n!==id+'.json'),[]);
});

test('断点编号禁止路径穿越，不存在的断点返回null',async()=>{
 assert.throws(()=>saveWorkflowCheckpoint('../library',{}),/无效/);await assert.rejects(()=>loadWorkflowCheckpoint('../library'),/无效/);assert.equal(await loadWorkflowCheckpoint(randomUUID()),null);
});

test('分页工作池同时启动多个worker且不超过并发上限，按输入次序返回结果',async()=>{
 let active=0,peak=0,release;const gate=new Promise(resolve=>{release=resolve;}),starts=[];
 const progress=[];
 const job=mapPageBatches([1,2,3,4,5,6,7,8],{concurrency:3,batchSize:2,onProgress:p=>progress.push(p),worker:async(batch,{workerId,attempt})=>{
  active++;peak=Math.max(peak,active);starts.push({batch,workerId,attempt});if(starts.length===3)release();await gate;await new Promise(resolve=>setTimeout(resolve,batch[0]===1?15:1));active--;return batch.map(n=>n*10);
 }});
 const out=await job;assert.equal(peak,3);assert.equal(starts.length,4);assert.ok(starts.every(s=>s.attempt===1));assert.deepEqual(out.results.map(r=>r.value),[[10,20],[30,40],[50,60],[70,80]]);assert.deepEqual(out.failures,[]);
 assert.ok(progress.some(p=>p.activePages.length===6));assert.ok(progress.every(p=>p.workers.length<=3));assert.ok(progress.flatMap(p=>p.workers).every(w=>w.id==='writer-'+w.workerId));assert.equal(progress.at(-1).completedPages,8);assert.equal(progress.at(-1).successfulPages,8);assert.deepEqual(progress.at(-1).activePages,[]);
});

test('一个写作批次失败不会取消其他页面，并区分失败进度',async()=>{
 const seen=[],progress=[];
 const out=await mapPageBatches([1,2,3,4,5],{concurrency:2,batchSize:2,onProgress:p=>progress.push(p),worker:async batch=>{seen.push(...batch);if(batch.includes(3))throw new Error('第3页内容未完整提交 sk-test-private-token123 Bearer sensitive-header');return {accepted:batch};}});
 assert.deepEqual(seen.sort(),[1,2,3,4,5]);assert.deepEqual(out.results.map(r=>r.pages),[[1,2],[5]]);assert.deepEqual(out.failures.map(f=>f.pages),[[3,4]]);assert.match(out.failures[0].error,/第3页/);assert.equal(progress.at(-1).completedPages,5);assert.equal(progress.at(-1).successfulPages,3);assert.equal(progress.at(-1).failedPages,2);assert.deepEqual(progress.at(-1).activePages,[]);
 assert.equal(JSON.stringify(out.failures).includes('sk-test-private-token123'),false);assert.equal(JSON.stringify(out.failures).includes('sensitive-header'),false);
});
