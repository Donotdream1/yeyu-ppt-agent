import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const queues=new Map();
export function atomicUpdateJson(file,initial,change){
 const key=path.resolve(file),operation=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(()=>commitJson(key,initial,change)),tail=operation.catch(()=>{});queues.set(key,tail);void tail.then(()=>{if(queues.get(key)===tail)queues.delete(key);});return operation;
}
async function commitJson(file,initial,change){
 const lock=file+'.lock',started=Date.now(),token=randomUUID();let handle;
 while(!handle){let candidate;try{candidate=await fs.open(lock,'wx');await candidate.writeFile(JSON.stringify({pid:process.pid,token}));handle=candidate;}catch(e){if(candidate){await candidate.close().catch(()=>{});await fs.unlink(lock).catch(()=>{});}if(!['EEXIST','EPERM','EBUSY','EACCES'].includes(e.code))throw e;
   try{const owner=JSON.parse(await fs.readFile(lock,'utf8'));try{process.kill(owner.pid,0);}catch(dead){if(dead.code==='ESRCH'){await fs.unlink(lock).catch(()=>{});continue;}}}catch{}
   if(Date.now()-started>15000)throw Error('素材索引正在更新，请稍后重试');await pause(30);
 }}
 const temporary=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
 try{let db;try{db=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;db=structuredClone(initial);}await change(db);await fs.writeFile(temporary,JSON.stringify(db));
  for(let attempt=0;;attempt++){try{await fs.rename(temporary,file);break;}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||attempt>=15)throw e;await pause(25*(attempt+1));}}
  return db;
 }finally{await fs.unlink(temporary).catch(()=>{});await handle.close();for(let attempt=0;attempt<8;attempt++){try{const owner=JSON.parse(await fs.readFile(lock,'utf8'));if(owner.token!==token)break;await fs.unlink(lock);break;}catch(e){if(e.code==='ENOENT')break;if(!['EPERM','EBUSY','EACCES'].includes(e.code))throw e;await pause(25*(attempt+1));}}}
}
