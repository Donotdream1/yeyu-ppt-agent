import {AsyncLocalStorage} from 'node:async_hooks';
const context=new AsyncLocalStorage(),tasks=new Map();
export const isTaskStopped=e=>e?.code==='TASK_STOPPED'||context.getStore()?.controller.signal.aborted===true;
export const taskStoppedError=()=>Object.assign(Error('用户已停止任务，已完成内容和断点已保留'),{code:'TASK_STOPPED'});
export const currentTaskSignal=()=>context.getStore()?.controller.signal;
export function throwIfTaskStopped(){if(currentTaskSignal()?.aborted)throw taskStoppedError();}
export function createTaskControl(id,{onStop=()=>{},kind='generation'}={}){
 if(tasks.has(id))throw Object.assign(Error('任务仍在运行'),{status:409});
 const task={id,kind,controller:new AbortController(),onStop,sealed:false,done:false};tasks.set(id,task);return task;
}
export function runWithTaskControl(task,fn){return context.run(task,()=>Promise.resolve().then(fn));}
export function releaseTaskControl(task){task.done=true;if(tasks.get(task.id)===task)tasks.delete(task.id);}
export function taskControlState(id){const task=tasks.get(id);return task?{id,kind:task.kind,status:task.controller.signal.aborted?'stopping':'running',canStop:!task.sealed}:null;}
export async function requestTaskStop(id){
 const task=tasks.get(id);if(!task)return null;if(task.sealed)throw Object.assign(Error('结果已进入最终保存，请等待完成'),{status:409});
 if(!task.controller.signal.aborted){task.controller.abort(taskStoppedError());await task.onStop();}
 return {id,status:task.done?'stopped':'stopping'};
}
export function sealTaskCommit(){throwIfTaskStopped();const task=context.getStore();if(task)task.sealed=true;}
