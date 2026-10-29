import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTaskControl,runWithTaskControl,releaseTaskControl,requestTaskStop,throwIfTaskStopped,taskControlState,sealTaskCommit} from '../server/task-control.mjs';
import {mapPageBatches} from '../server/workflow-checkpoints.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('stop is task scoped, idempotent, and a final commit cannot be interrupted',async()=>{
 const a=createTaskControl(randomUUID()),b=createTaskControl(randomUUID());
 try{await requestTaskStop(a.id);await requestTaskStop(a.id);await assert.rejects(runWithTaskControl(a,throwIfTaskStopped),{code:'TASK_STOPPED'});
  await runWithTaskControl(b,()=>{throwIfTaskStopped();sealTaskCommit();});await assert.rejects(requestTaskStop(b.id),{status:409});assert.equal(taskControlState(b.id).status,'running');
 }finally{releaseTaskControl(a);releaseTaskControl(b);}assert.equal(await requestTaskStop(a.id),null);
});

test('stopping a bounded page pool preserves accepted work and waits for the in-flight safe boundary',async()=>{
 const task=createTaskControl(randomUUID()),entered=deferred(),boundary=deferred(),started=[],saved=[];let settled=false;
 const running=runWithTaskControl(task,()=>mapPageBatches([1,2,3,4],{concurrency:1,batchSize:1,worker:async([page])=>{started.push(page);if(page===2){entered.resolve();await boundary.promise;throwIfTaskStopped();}saved.push(page);}}));
 const checked=assert.rejects(running,{code:'TASK_STOPPED'}).then(()=>settled=true);
 try{await entered.promise;await requestTaskStop(task.id);await new Promise(r=>setImmediate(r));assert.equal(settled,false);assert.deepEqual(saved,[1]);assert.deepEqual(started,[1,2]);boundary.resolve();await checked;assert.deepEqual(saved,[1]);assert.deepEqual(started,[1,2]);}finally{boundary.resolve();releaseTaskControl(task);}
});
