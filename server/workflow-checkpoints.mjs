import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicUpdateJson} from './atomic-json.mjs';
import {dataDir} from './library.mjs';

const queues=new Map();
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const credentials=new Set(['apikey','authorization','deepseekapikey','accesstoken','refreshtoken']);
const sensitive=key=>credentials.has(key.replace(/[-_\s]/g,'').toLowerCase());
const safeFailure=error=>String(error?.message||error).replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g,'[redacted]').replace(/\bBearer\s+[^\s,;]+/gi,'Bearer [redacted]');

function validateId(id){if(typeof id!=='string'||!uuid.test(id))throw new Error('无效的工作流断点编号');return id;}

// Walk before cloning so credentials are also removed from nested request headers
// and redacted when an error string happens to repeat a supplied credential.
export function sanitizeWorkflowSnapshot(value){
 const secrets=new Set();
 function collect(item){
  if(!item||typeof item!=='object')return;
  for(const [key,child]of Object.entries(item)){
   if(sensitive(key)&&typeof child==='string'&&child){secrets.add(child);if(/^Bearer\s+/i.test(child))secrets.add(child.replace(/^Bearer\s+/i,''));}
   else collect(child);
  }
 }
 collect(value);
 const redact=text=>{for(const secret of [...secrets].sort((a,b)=>b.length-a.length))text=text.split(secret).join('[redacted]');return text;};
 function clean(item){
  if(typeof item==='string')return redact(item);
  if(Array.isArray(item))return item.map(clean);
  if(!item||typeof item!=='object')return item;
  if(item instanceof Date)return item.toISOString();
  const out={};for(const [key,child]of Object.entries(item))if(!sensitive(key))out[key]=clean(child);return out;
 }
 return clean(value);
}

export function saveWorkflowCheckpoint(id,snapshot){
 validateId(id);
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw new TypeError('断点必须是工作流快照');
 const safe=sanitizeWorkflowSnapshot(snapshot);
 const work=(queues.get(id)||Promise.resolve()).then(async()=>{
  const folder=path.join(dataDir,'workflows');await fs.mkdir(folder,{recursive:true});
  return atomicUpdateJson(path.join(folder,id+'.json'),{},async current=>{
   const createdAt=current.createdAt||safe.createdAt||new Date().toISOString();
   for(const key of Object.keys(current))delete current[key];
   Object.assign(current,safe,{id,checkpointId:id,createdAt,updatedAt:new Date().toISOString()});
  });
 });
 const pending=work.catch(()=>{});queues.set(id,pending);
 void pending.then(()=>{if(queues.get(id)===pending)queues.delete(id);});
 return work;
}

export async function loadWorkflowCheckpoint(id){
 validateId(id);
 await queues.get(id);
 try{return sanitizeWorkflowSnapshot(JSON.parse(await fs.readFile(path.join(dataDir,'workflows',id+'.json'),'utf8')));}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
}

export function publicWorkflowJob(snapshot){
 if(!snapshot)return null;
 const safe=sanitizeWorkflowSnapshot(snapshot),job={};
 for(const key of ['id','status','phase','progress','checkpointId','resumable','plan','error','output','createdAt','updatedAt'])if(safe[key]!==undefined)job[key]=safe[key];
 return job;
}

/**
 * Independent model workers share a bounded queue; failures stay with their
 * own batch. Workers can retry internally; this pool starts each batch once.
 * completedPages counts settled pages (including failed batches), while
 * successfulPages is useful when the coordinator needs a success-only count.
 */
export async function mapPageBatches(pages,{concurrency=3,batchSize=2,batches:preparedBatches,worker,onProgress=()=>{}}={}){
 if(!Array.isArray(pages))throw new TypeError('pages 必须是数组');
 if(typeof worker!=='function')throw new TypeError('worker 必须是函数');
 for(const [name,value]of Object.entries({concurrency,batchSize}))if(!Number.isInteger(value)||value<1)throw new RangeError(name+' 必须是正整数');
 const batches=preparedBatches?preparedBatches.map(batch=>[...batch]):[];
 if(preparedBatches){const flat=batches.flat();if(batches.some(b=>!b.length)||flat.length!==pages.length||flat.some((n,i)=>n!==pages[i]))throw Error('预分组必须按顺序完整覆盖页面，不能遗漏或重复');}
 else for(let i=0;i<pages.length;i+=batchSize)batches.push(pages.slice(i,i+batchSize));
 const results=[],failures=[],workers=Array.from({length:Math.min(concurrency,batches.length)},(_,i)=>({id:'writer-'+(i+1),workerId:i+1,status:'idle',pages:[],attempt:1}));
 let next=0,successfulPages=0,failedPages=0,progressQueue=Promise.resolve(),progressError;
 const pageId=value=>value&&typeof value==='object'?(value.page??value.id):value;
 function notify(){
  const progress={totalPages:pages.length,completedPages:successfulPages+failedPages,successfulPages,failedPages,processedPages:successfulPages+failedPages,totalBatches:batches.length,completedBatches:results.length,failedBatches:failures.length,concurrency,batchSize,activePages:workers.flatMap(w=>w.pages),workers:workers.map(w=>({...w,pages:[...w.pages]}))};
  progressQueue=progressQueue.then(()=>onProgress(progress)).catch(error=>{progressError??=error;});
  return progressQueue;
 }
 await notify();
 await Promise.all(workers.map(async state=>{
  while(next<batches.length){
   const batchIndex=next++,batch=batches[batchIndex];state.status='working';state.pages=batch.map(pageId);state.batchIndex=batchIndex;
   await notify();
   try{const value=await worker(batch,{workerId:state.workerId,attempt:1});results.push({batchIndex,pages:batch.map(pageId),workerId:state.workerId,value});successfulPages+=batch.length;}
   catch(error){failures.push({batchIndex,pages:batch.map(pageId),workerId:state.workerId,error:safeFailure(error),...(error?.issues?{issues:error.issues}:{})});failedPages+=batch.length;}
   finally{state.status='idle';state.pages=[];delete state.batchIndex;await notify();}
  }
 }));
 await progressQueue;
 if(progressError)throw progressError;
 return {results:results.sort((a,b)=>a.batchIndex-b.batchIndex),failures:failures.sort((a,b)=>a.batchIndex-b.batchIndex)};
}
