import {checkHermesBootstrap} from './hermes-runtime.mjs';

// Historical failures stay in the checkpoint and run logs. Recovery availability
// is current state, derived when reading a stopped task, never a completed result.
export async function withHermesRuntimeRecovery(job,{check=checkHermesBootstrap}={}){
 if(!job||job.status!=='failed'||!/(?:No module named ['"]hermes_bootstrap['"]|Hermes 源码目录不完整)/.test(job.error||''))return job;
 let runtime;try{runtime=await check();}catch{return job;}if(!runtime.available)return job;
 const message=job.resumable?'此前启动失败，当前 Hermes 启动检查已通过。点击“继续生成”恢复原任务，已保存的页面会保留。':'此前启动失败，当前 Hermes 启动检查已通过，请重试当前操作。';
 return {...job,phase:'Hermes 启动环境已恢复，等待继续',error:message,recovery:{type:'hermes-runtime',status:'ready',checkedAt:runtime.checkedAt,originalError:job.error,message}};
}
