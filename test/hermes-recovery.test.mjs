import test from 'node:test';
import assert from 'node:assert/strict';
import {withHermesRuntimeRecovery} from '../server/hermes-recovery.mjs';

test('old bootstrap error becomes an actionable recovery state only after a real startup check passes',async()=>{
 const job={id:'fixture',status:'failed',resumable:true,error:"Hermes：No module named 'hermes_bootstrap'",phase:'规划',progress:{completedPages:[1,2]}};
 const unchanged=structuredClone(job),ready=await withHermesRuntimeRecovery(job,{check:async()=>({available:true,checkedAt:'fixture-time'})});assert.deepEqual(job,unchanged);assert.equal(ready.status,'failed');assert.equal(ready.resumable,true);assert.equal(ready.recovery.originalError,job.error);assert.match(ready.error,/启动检查已通过/);assert.deepEqual(ready.progress.completedPages,[1,2]);
 assert.equal(await withHermesRuntimeRecovery(job,{check:async()=>({available:false})}),job);assert.equal(await withHermesRuntimeRecovery(job,{check:async()=>{throw Error('probe failed');}}),job);
 const other={...job,error:'保持素材原字号时文字溢出'},done={...job,status:'done'};for(const item of [other,done])assert.equal(await withHermesRuntimeRecovery(item,{check:async()=>{throw Error('should not run');}}),item);
});
