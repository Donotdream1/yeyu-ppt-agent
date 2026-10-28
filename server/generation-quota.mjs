import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {atomicUpdateJson} from './atomic-json.mjs';
import {dataDir} from './library.mjs';

const context=new AsyncLocalStorage();
export const currentGenerationQuota=()=>context.getStore();
export function createGenerationQuota({directory=path.join(dataDir,'auth'),outputsDirectory=path.join(dataDir,'outputs'),ownership=async()=>({owners:{outputs:{}}})}={}){
 const file=path.join(directory,'generation-quota.json');let recovery;
 const snapshot=(u,role)=>{const used=Object.keys(u.completed||{}).length,reserved=Object.keys(u.pending||{}).length,limit=u.limit??5;return {limit:role==='owner'?null:limit,used,reserved,remaining:role==='owner'?null:Math.max(0,limit-used-reserved),unlimited:role==='owner'};};
 async function change(fn){await fs.mkdir(directory,{recursive:true});
  recovery||=atomicUpdateJson(file,{users:{}},async d=>{for(const u of Object.values(d.users)){for(const [ticket,p]of Object.entries(u.pending||{})){let output;try{const checkpoint=JSON.parse(await fs.readFile(path.join(dataDir,'workflows',ticket+'.json'),'utf8'));if(checkpoint.status==='done'&&checkpoint.output?.url)output=checkpoint.output;}catch{}if(output)u.completed[output.conversationRootId||output.plan?.conversationRootId||output.id]={ticket};else if(p.outputId)u.completed[p.outputId]={ticket};delete u.pending[ticket];}}}).catch(e=>{recovery=undefined;throw e;});
  await recovery;let result;await atomicUpdateJson(file,{users:{}},async d=>{result=await fn(d);});return result;
 }
 async function account(d,user){if(!d.users[user.id]){const completed={},owners=(await ownership()).owners||{};for(const [id,owner]of Object.entries(owners.outputs||{})){if(owner!==user.id)continue;let info;try{info=JSON.parse(await fs.readFile(path.join(outputsDirectory,id+'.json'),'utf8'));}catch{continue;}if(info.internalTest||!info.url)continue;const root=info.conversationRootId||info.plan?.conversationRootId||id;completed[root]={legacy:true};}d.users[user.id]={completed,pending:{},limit:5};}return d.users[user.id];}
 const summary=user=>change(async d=>snapshot(await account(d,user),user.role));
 async function reserve(user,ticket=randomUUID()) {return change(async d=>{const u=await account(d,user);if(Object.values(u.completed).some(v=>v.ticket===ticket))return ticket;if(u.pending[ticket])throw Object.assign(Error('该任务正在运行，请等待完成后再试'),{status:409});const q=snapshot(u,user.role);if(!q.unlimited&&q.remaining<=0)throw Object.assign(Error(q.reserved?'生成额度已用完或正在使用中，请等待任务完成；需要更多额度请联系管理员':'已达到生成 '+q.limit+' 份 PPT 的上限，请联系管理员增加额度'),{status:403,code:'GENERATION_QUOTA_EXCEEDED'});u.pending[ticket]={createdAt:new Date().toISOString()};return ticket;});}
 async function finish(user,ticket,output){return change(async d=>{const u=await account(d,user);if(!u.pending[ticket])return;if(output?.id&&output.url)u.completed[output.conversationRootId||output.plan?.conversationRootId||output.id]={ticket,createdAt:new Date().toISOString()};delete u.pending[ticket];});}
 async function setLimit(actor,user,limit){if(actor.role!=='owner')throw Object.assign(Error('仅管理员可调整生成额度'),{status:403});if(!Number.isInteger(limit)||limit<0||limit>100000)throw Error('额度需为0–100000的整数');return change(async d=>{const u=await account(d,user);u.limit=limit;u.updatedBy=actor.id;return snapshot(u,user.role);});}
 return {summary,reserve,finish,setLimit};
}
let service;
export const generationQuota={summary:(...a)=>service.summary(...a),reserve:(...a)=>service.reserve(...a),finish:(...a)=>service.finish(...a),setLimit:(...a)=>service.setLimit(...a)};
export function installGenerationQuota(app,auth){
 service=createGenerationQuota({...(process.env.NODE_ENV==='test'&&process.env.AUTH_DATA_DIR?{directory:process.env.AUTH_DATA_DIR}:{}),ownership:()=>auth.db()});
 app.get('/api/generation-quota',async(req,res)=>res.json(await service.summary(req.user)));
 app.patch('/api/admin/users/:id/generation-quota',async(req,res)=>{const users=await auth.listUsers(req.user),user=users.find(u=>u.id===req.params.id);if(!user)throw Object.assign(Error('用户不存在'),{status:404});res.json(await service.setLimit(req.user,user,req.body.limit));});
 app.use('/api',async(req,res,next)=>{
  if(req.method!=='POST'||!/^\/(generate|export|jobs\/[a-f0-9-]{36}\/resume)$/.test(req.path)||(req.path==='/generate'&&(req.body?.planningOnly===true||req.body?.styleOnly===true))||req.body?.baseOutputId||req.body?.conversationRootId)return next();
  try{const ticket=await service.reserve(req.user,req.params.id||req.path.match(/^\/jobs\/([^/]+)/)?.[1]||randomUUID()),account=req.user,isJob=req.path!=='/export';let settled=false;
   const send=res.json.bind(res);res.json=value=>{if(res.statusCode>=400){void service.finish(account,ticket).then(()=>send(value)).catch(next);return res;}if(!isJob&&value?.id&&value.url){settled=true;void service.finish(account,ticket,value).then(()=>send(value)).catch(next);return res;}return send(value);};
   res.on('finish',()=>{if(!settled&&res.statusCode>=400)void service.finish(account,ticket).catch(()=>{});});
   context.run({ticket,account,finish:output=>service.finish(account,ticket,output)},next);
  }catch(e){next(e);}
 });
}
