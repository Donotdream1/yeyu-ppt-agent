import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,randomUUID,createCipheriv,createDecipheriv} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {atomicUpdateJson} from './atomic-json.mjs';
import {dataDir} from './library.mjs';

const context=new AsyncLocalStorage();
async function readToolStream(response){
 if(!response.headers?.get('content-type')?.includes('text/event-stream')||!response.body)throw Error('接口未返回流式响应，无法用于 Hermes 智能体');
 const reader=response.body.getReader(),decoder=new TextDecoder(),calls=new Map();let buffer='',size=0,finished=false;
 const line=value=>{if(!value.startsWith('data:'))return;const text=value.slice(5).trim();if(!text||text==='[DONE]')return;let data;try{data=JSON.parse(text);}catch{throw Error('模型流式响应格式不正确');}for(const choice of data.choices||[]){if(choice.finish_reason)finished=true;for(const call of choice.delta?.tool_calls||[]){const old=calls.get(call.index??0)||'';calls.set(call.index??0,old+(call.function?.name||''));}}};
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw Error('连接测试响应过大，请检查接口');buffer+=decoder.decode(value,{stream:true});let i;while((i=buffer.indexOf('\n'))!==-1){line(buffer.slice(0,i).trim());buffer=buffer.slice(i+1);}}buffer+=decoder.decode();if(buffer.trim())line(buffer.trim());}catch(e){if(e.name==='TimeoutError'||e.name==='AbortError')throw Error('连接测试超时，请检查模型响应速度');throw e;}finally{await reader.cancel().catch(()=>{});}
 if(!finished)throw Error('模型未返回完整的流式结束标记');return [...calls.values()].includes('connection_check');
}
export const currentModelConnection=()=>context.getStore();
export const modelApiKey=()=>currentModelConnection()?.apiKey||process.env.DEEPSEEK_API_KEY;
export const withModelConnection=(connection,fn)=>context.run(connection,fn);
export function completionEndpoint(){return (currentModelConnection()?.baseUrl||'https://api.deepseek.com').replace(/\/$/,'')+'/chat/completions';}
export function compatibleModelFetch(fetchImpl=fetch){return (url,options)=>{const connection=currentModelConnection();if(!connection)return fetchImpl(url,options);const body=JSON.parse(options.body);body.model=connection.model;if(!connection.baseUrl.includes('api.deepseek.com'))delete body.thinking;return fetchImpl(completionEndpoint(),{...options,headers:{...options.headers,Authorization:'Bearer '+connection.apiKey},body:JSON.stringify(body)});};}
export function validateConnection(input){
 const name=String(input.name||'').trim(),model=String(input.model||'').trim();let url;
 try{url=new URL(input.baseUrl);}catch{throw Error('请输入完整的模型接口地址');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||['169.254.169.254','metadata.google.internal'].includes(url.hostname))throw Error('模型接口地址无效');
 if(/\/chat\/completions\/?$/.test(url.pathname))url.pathname=url.pathname.replace(/\/chat\/completions\/?$/,'');
 if(!name||name.length>60||!model||model.length>100||url.href.length>500)throw Error('连接名称、模型名称或接口地址无效');
 if(input.apiKey!==undefined&&(typeof input.apiKey!=='string'||input.apiKey.length>2000||/[\r\n]/.test(input.apiKey)))throw Error('API Key 格式不正确');
 return {name,model,provider:['deepseek','openai','compatible'].includes(input.provider)?input.provider:'compatible',baseUrl:url.href.replace(/\/$/,'')};
}
export function createModelConnections({directory=path.join(dataDir,'model-connections'),fetchImpl=fetch}={}){
 const file=path.join(directory,'connections.json');
 async function key(){await fs.mkdir(directory,{recursive:true});const dest=path.join(directory,'encryption-key');try{return await fs.readFile(dest);}catch(e){if(e.code!=='ENOENT')throw e;try{await fs.writeFile(dest,randomBytes(32),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}return fs.readFile(dest);}}
 async function seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',await key(),iv),body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv.toString('base64url'),body.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');}
 async function unseal(value){const [iv,body,tag]=value.split('.'),decipher=createDecipheriv('aes-256-gcm',await key(),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(body,'base64url')),decipher.final()]).toString('utf8');}
 const read=()=>fs.readFile(file,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {users:{}};throw e;});
 const publicConnection=({secret,...item})=>({...item,hasKey:!!secret});
 async function list(userId){const u=(await read()).users[userId]||{items:[],activeId:null};return {...u,items:u.items.map(publicConnection)};}
 async function save(userId,input){const valid=validateConnection(input),id=input.id||randomUUID();await fs.mkdir(directory,{recursive:true});let result;
  await atomicUpdateJson(file,{users:{}},async db=>{const u=db.users[userId]||={items:[],activeId:null},old=u.items.find(v=>v.id===id);if(input.id&&!old)throw Object.assign(Error('连接不存在'),{status:404});if(!old&&u.items.length>=20)throw Error('最多保存20个模型连接');const secret=input.apiKey?.trim()?await seal(input.apiKey.trim()):old?.secret;if(!secret)throw Error('请填写 API Key');const item={id,...valid,secret,updatedAt:new Date().toISOString()};u.items=u.items.filter(v=>v.id!==id).concat(item);if(input.activate!==false||!u.activeId)u.activeId=id;result=publicConnection(item);});return result;
 }
 async function activate(userId,id){await atomicUpdateJson(file,{users:{}},db=>{const u=db.users[userId];if(id!==null&&!u?.items.some(v=>v.id===id))throw Object.assign(Error('连接不存在'),{status:404});if(u)u.activeId=id;});return list(userId);}
 async function remove(userId,id){await atomicUpdateJson(file,{users:{}},db=>{const u=db.users[userId];if(!u?.items.some(v=>v.id===id))throw Object.assign(Error('连接不存在'),{status:404});u.items=u.items.filter(v=>v.id!==id);if(u.activeId===id)u.activeId=null;});return list(userId);}
 async function resolve(userId,id){const u=(await read()).users[userId],item=u?.items.find(v=>v.id===(id||u.activeId));return item?{...publicConnection(item),apiKey:await unseal(item.secret)}:null;}
 async function test(userId,input){const old=input.id?await resolve(userId,input.id):null;if(input.id&&!old)throw Object.assign(Error('连接不存在'),{status:404});const connection={...validateConnection(input),apiKey:input.apiKey?.trim()||old?.apiKey};if(!connection.apiKey)throw Error('请填写 API Key');const started=Date.now();let response;
  try{response=await fetchImpl(connection.baseUrl+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+connection.apiKey},signal:AbortSignal.timeout(30000),body:JSON.stringify({model:connection.model,stream:true,max_tokens:128,messages:[{role:'user',content:'Call connection_check with ok=true.'}],tools:[{type:'function',function:{name:'connection_check',description:'Verify tool calling',parameters:{type:'object',properties:{ok:{type:'boolean'}},required:['ok']}}}],tool_choice:'auto'})});}catch{throw Error('连接失败，请检查接口地址、网络和服务状态');}
  if(!response.ok)throw Error(response.status===401||response.status===403?'API Key 无效或无权限':response.status===429?'模型服务请求受限，请稍后重试':`模型服务返回 HTTP ${response.status}，请检查模型名称与接口兼容性`);
  const toolCalling=await readToolStream(response);return {ok:toolCalling,toolCalling,latencyMs:Date.now()-started,model:connection.model,message:toolCalling?'连接正常，支持流式响应与智能体工具调用':'服务可连接，但未通过工具调用测试，暂不建议用于 Hermes'};
 }
 return {list,save,activate,remove,resolve,test};
}
export const modelConnections=createModelConnections(process.env.NODE_ENV==='test'&&process.env.AUTH_DATA_DIR?{directory:path.join(process.env.AUTH_DATA_DIR,'model-connections')}:{});
export function installModelConnections(app,auth){
 app.get('/api/model-connections',async(req,res)=>res.json(await modelConnections.list(req.user.id)));
 app.post('/api/model-connections',async(req,res)=>res.status(201).json(await modelConnections.save(req.user.id,req.body)));
 app.post('/api/model-connections/test',async(req,res)=>res.json(await modelConnections.test(req.user.id,req.body)));
 app.post('/api/model-connections/active',async(req,res)=>res.json(await modelConnections.activate(req.user.id,req.body.id??null)));
 app.delete('/api/model-connections/:id',async(req,res)=>res.json(await modelConnections.remove(req.user.id,req.params.id)));
 app.use('/api',async(req,res,next)=>{if(!req.user)return next();try{const c=await modelConnections.resolve(req.user.id);const effective=c||{baseUrl:'https://api.deepseek.com',model:req.body?.model||req.user.preferences?.model||process.env.DEEPSEEK_MODEL||'deepseek-flash',apiKey:req.body?.apiKey||process.env.DEEPSEEK_API_KEY};if(req.body&&typeof req.body==='object'){req.body.model=effective.model;req.body.apiKey=effective.apiKey;}withModelConnection(effective,()=>next());}catch(e){next(e);}});
}
