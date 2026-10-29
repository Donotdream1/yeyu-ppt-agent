import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,randomUUID,scrypt as derive,timingSafeEqual,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {promisify} from 'node:util';
import {dataDir} from './library.mjs';
import {materialLibraryForbidden,grantMaterialPreviews,grantSourcePreviews} from './material-library-access.mjs';
import {generationQuota} from './generation-quota.mjs';
import {installRegistrationRoutes} from './registration-captcha.mjs';
import {collaboration} from './collaboration.mjs';

const scrypt=promisify(derive),cookieName='yeyu_session',publicUser=u=>u&&({id:u.id,username:u.username,displayName:u.displayName,role:u.role,preferences:u.preferences||{}});
export function createLocalAuth({directory=path.join(dataDir,'auth')}={}){
 let state,loading,chain=Promise.resolve();const attempts=new Map();
 async function db(){if(state)return state;if(!loading)loading=(async()=>{try{state=JSON.parse(await fs.readFile(path.join(directory,'accounts.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={users:[],sessions:{},owners:{outputs:{},jobs:{},roots:{},assets:{},previews:{}},links:{}};}return state;})();return loading;}
 async function save(){await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'accounts.json'),temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(state,null,2));await fs.rename(temp,file);}
 function lock(fn){const task=chain.catch(()=>{}).then(fn);chain=task.catch(()=>{});return task;}
 async function password(value){if(typeof value!=='string'||value.length<8||value.length>128)throw Error('密码长度需为8–128位');const salt=randomBytes(16).toString('hex'),hash=Buffer.from(await scrypt(value,salt,64)).toString('hex');return {salt,hash};}
 async function matches(value,u){if(typeof value!=='string'||value.length>128)return false;const actual=await scrypt(value,u.salt,64);return timingSafeEqual(Buffer.from(actual),Buffer.from(u.hash,'hex'));}
 const hashToken=token=>createHash('sha256').update(token).digest('hex');
 async function issue(user){const token=randomBytes(32).toString('base64url');(await db()).sessions[hashToken(token)]={userId:user.id,expiresAt:Date.now()+7*86400000};return token;}
 async function register(input){return lock(async()=>{const d=await db(),username=String(input.username||'').normalize('NFKC').toLowerCase().trim();if(!/^[a-z0-9][a-z0-9_.@-]{2,63}$/.test(username))throw Error('账号需为3–64位英文、数字或邮箱');if(d.users.some(u=>u.username===username))throw Error('该账号已注册');const secret=await password(input.password),u={id:randomUUID(),username,displayName:String(input.displayName||username).trim().slice(0,40)||username,role:d.users.length?'member':'owner',preferences:{},...secret,createdAt:new Date().toISOString()};d.users.push(u);const token=await issue(u);await save();return {user:publicUser(u),token};});}
 async function login(input,ip='local'){
  const key=ip+':'+String(input.username||'').toLowerCase();return lock(async()=>{
   const old=attempts.get(key);if(old&&old.until>Date.now()&&old.count>=8)throw Error('尝试次数较多，请15分钟后重试');
   const d=await db(),u=d.users.find(u=>u.username===String(input.username||'').normalize('NFKC').toLowerCase().trim()),valid=await matches(input.password,u||{salt:'0'.repeat(32),hash:'0'.repeat(128)});
   if(!u||!valid||u.status==='disabled'||u.status==='removed'){const a=old&&old.until>Date.now()?old:{count:0,until:Date.now()+900000};a.count++;attempts.set(key,a);if(attempts.size>2000)attempts.delete(attempts.keys().next().value);throw Error('账号或密码不正确');}
   attempts.delete(key);u.lastLoginAt=new Date().toISOString();const token=await issue(u);await save();return {user:publicUser(u),token};
  });
 }
 async function authenticate(token){if(!token||typeof token!=='string'||token.length>100)return null;const d=await db(),session=d.sessions[hashToken(token)];if(!session||session.expiresAt<Date.now())return null;const user=d.users.find(u=>u.id===session.userId);return user&&user.status!=='disabled'&&user.status!=='removed'?publicUser(user):null;}
 async function logout(token){return lock(async()=>{delete (await db()).sessions[hashToken(token||'')];await save();});}
 async function update(userId,input,token){return lock(async()=>{const d=await db(),u=d.users.find(u=>u.id===userId);if(!u)throw Error('账号不存在');const changed={...u,preferences:{...u.preferences}};
 if(input.displayName!==undefined)changed.displayName=String(input.displayName).trim().slice(0,40)||u.username;
 if(input.preferences){const p=input.preferences;if(p.model!==undefined&&(typeof p.model!=='string'||p.model.length>100))throw Error('模型名称无效');if(p.model!==undefined)changed.preferences.model=p.model;
 if(p.personalization!==undefined){const v=p.personalization;if(!v||typeof v!=='object'||typeof v.sidebarCollapsed!=='boolean'||typeof v.reducedMotion!=='boolean'||!['standard','large'].includes(v.fontSize)||!['create','history','projects','styles'].includes(v.startPage))throw Error('个性化偏好格式不正确');changed.preferences.personalization={sidebarCollapsed:v.sidebarCollapsed,reducedMotion:v.reducedMotion,fontSize:v.fontSize,startPage:v.startPage};}
 if(p.presentation!==undefined){const v=p.presentation;if(!v||typeof v!=='object'||Array.isArray(v)||typeof v.templateId!=='string'||v.templateId.length>100||typeof v.styleSkillId!=='string'||v.styleSkillId.length>100||!Number.isInteger(v.pageCount)||v.pageCount!==0&&(v.pageCount<3||v.pageCount>30)||!['full','balanced','spacious'].includes(v.layoutDensity))throw Error('演示偏好格式不正确');changed.preferences.presentation={templateId:v.templateId,styleSkillId:v.styleSkillId,pageCount:v.pageCount,layoutDensity:v.layoutDensity};}}
 if(input.newPassword){if(!await matches(input.currentPassword,u))throw Error('当前密码不正确');Object.assign(changed,await password(input.newPassword));}
 Object.assign(u,changed);if(input.newPassword)for(const [id,s]of Object.entries(d.sessions))if(s.userId===u.id&&id!==hashToken(token||''))delete d.sessions[id];await save();return publicUser(u);});}

 const adminUser=u=>({...publicUser(u),status:u.status||'active',createdAt:u.createdAt,lastLoginAt:u.lastLoginAt});
 const authorizeAdmin=(d,actor)=>{const current=d.users.find(u=>u.id===actor?.id);if(!current||current.role!=='owner'||['disabled','removed'].includes(current.status))throw Object.assign(Error('仅管理员可管理用户'),{status:403});};
 const revoke=(d,id)=>{for(const [key,s]of Object.entries(d.sessions))if(s.userId===id)delete d.sessions[key];};
 const audit=(d,actor,action,target)=>{(d.adminAudit||=[]).push({id:randomUUID(),actorId:actor.id,action,targetId:target,at:new Date().toISOString()});d.adminAudit=d.adminAudit.slice(-1000);};
 async function listUsers(actor){const d=await db();authorizeAdmin(d,actor);return d.users.map(adminUser);}
 async function createUser(actor,input){return lock(async()=>{const d=await db();authorizeAdmin(d,actor);const username=String(input.username||'').normalize('NFKC').toLowerCase().trim();if(!/^[a-z0-9][a-z0-9_.@-]{2,63}$/.test(username))throw Error('账号需为3–64位英文、数字或邮箱');if(d.users.some(u=>u.username===username))throw Error('该账号已存在');const role=input.role||'member';if(!['owner','member'].includes(role))throw Error('角色无效');const secret=await password(input.password),u={id:randomUUID(),username,displayName:String(input.displayName||username).trim().slice(0,40)||username,role,status:'active',preferences:{},...secret,createdAt:new Date().toISOString()};d.users.push(u);audit(d,actor,'create-user',u.id);await save();return adminUser(u);});}
 async function manageUser(actor,id,patch){return lock(async()=>{const d=await db();authorizeAdmin(d,actor);const user=d.users.find(u=>u.id===id);if(!user)throw Object.assign(Error('用户不存在'),{status:404});const role=patch.role??user.role,status=patch.status??user.status??'active';if(!['owner','member'].includes(role)||!['active','disabled','removed'].includes(status))throw Error('角色或状态无效');if((role!==user.role||status!==(user.status||'active'))&&id===actor.id)throw Error('不能修改当前管理员自身的角色或启用状态');if(user.role==='owner'&&(user.status||'active')==='active'&&(role!=='owner'||status!=='active')&&d.users.filter(u=>u.role==='owner'&&(u.status||'active')==='active').length<=1)throw Error('必须保留至少一个启用的管理员');if(patch.displayName!==undefined&&(typeof patch.displayName!=='string'||!patch.displayName.trim()||patch.displayName.length>40))throw Error('昵称需为1–40字');Object.assign(user,{role,status,...(patch.displayName!==undefined?{displayName:patch.displayName.trim()}:{}),updatedAt:new Date().toISOString()});if(status!=='active'||role!==user.role)revoke(d,id);if(patch.role!==undefined)revoke(d,id);audit(d,actor,'update-user',id);await save();return adminUser(user);});}
 async function resetUserPassword(actor,id,newPassword){return lock(async()=>{const d=await db();authorizeAdmin(d,actor);if(id===actor.id)throw Error('请在账号设置中使用当前密码修改自己的密码');const u=d.users.find(u=>u.id===id&&u.status!=='removed');if(!u)throw Object.assign(Error('用户不存在'),{status:404});Object.assign(u,await password(newPassword));revoke(d,id);audit(d,actor,'reset-password',id);await save();return {ok:true};});}
 async function claim(kind,id,userId){if(!id)return;return lock(async()=>{const d=await db();d.owners[kind]||={};if(!d.owners[kind][id]){d.owners[kind][id]=userId;await save();}});}
 async function owns(kind,id,user){return !!user&&(user.role==='owner'||(await db()).owners[kind]?.[id]===user.id);}
 async function ownsOutput(id,user,includeShared=true){
  if(await owns('outputs',id,user))return true;
  try{
   const info=JSON.parse(await fs.readFile(path.join(dataDir,'outputs',id+'.json'),'utf8')),root=info.conversationRootId||info.plan?.conversationRootId,owners=(await db()).owners,rootOwner=owners.roots[root]||owners.outputs[root];
   const personalRoot=root&&await owns('roots',root,user),personalJob=info.execution?.checkpointId&&(!rootOwner||rootOwner===user.id)&&await owns('jobs',info.execution.checkpointId,user);
   if(personalRoot||personalJob){await claim('outputs',id,rootOwner||user.id);return true;}
  }catch{}
  return includeShared&&collaboration.canEditOutput(id,user);
 }
 async function sharedResource(kind,id,user){try{if(kind==='roots')return collaboration.canEditRoot(id,user);const folder=kind==='assets'?'page-assets':'workflows',info=JSON.parse(await fs.readFile(path.join(dataDir,folder,id+'.json'),'utf8')),root=kind==='assets'?info.sessionId?.slice(0,36):info.body?.rootId||info.rootId||info.plan?.conversationRootId;return collaboration.canEditRoot(root,user);}catch{return false;}}
 async function cipherKey(){const dest=path.join(directory,'url-key');try{return await fs.readFile(dest);}catch(e){if(e.code!=='ENOENT')throw e;await fs.mkdir(directory,{recursive:true});const bytes=randomBytes(32);try{await fs.writeFile(dest,bytes,{flag:'wx'});return bytes;}catch(e){if(e.code!=='EEXIST')throw e;return fs.readFile(dest);}}}
 async function publicId(id){return lock(async()=>{const d=await db();if(d.links[id])return d.links[id];if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('无效的作品编号');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',await cipherKey(),iv),body=Buffer.concat([cipher.update(id,'utf8'),cipher.final()]),value=['v1',iv.toString('base64url'),body.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');d.links[id]=value;await save();return value;});}
 async function resolvePublicId(value){try{if(typeof value!=='string'||value.length>180)throw Error();const [version,iv,body,tag]=value.split('.');if(version!=='v1')throw Error();const decipher=createDecipheriv('aes-256-gcm',await cipherKey(),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));const id=Buffer.concat([decipher.update(Buffer.from(body,'base64url')),decipher.final()]).toString('utf8');if(!/^[a-f0-9-]{36}$/i.test(id))throw Error();return id;}catch{throw Error('作品链接无效');}}
 return {db,register,login,authenticate,logout,update,listUsers,createUser,manageUser,resetUserPassword,claim,owns,ownsOutput,sharedResource,publicId,resolvePublicId,hasUsers:async()=>(await db()).users.length>0};
}
export const localAuth=createLocalAuth(process.env.NODE_ENV==='test'&&process.env.AUTH_DATA_DIR?{directory:path.resolve(process.env.AUTH_DATA_DIR)}:{});
const tokenFrom=req=>{const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));return raw?decodeURIComponent(raw.slice(cookieName.length+1)):'';};
const setCookie=(res,token)=>res.setHeader('Set-Cookie',`${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token?604800:0}`);
export function installLocalAuth(app){
 const testMode=process.env.NODE_ENV==='test'&&process.env.AUTH_TEST_MODE==='1',testUser={id:'test-local-user',username:'test',displayName:'本地测试',role:'owner',preferences:{}};
 app.get('/api/auth/session',async(req,res)=>res.json({user:testMode?testUser:await localAuth.authenticate(tokenFrom(req)),setupRequired:!await localAuth.hasUsers()}));
 installRegistrationRoutes(app,{register:input=>localAuth.register(input),onRegistered:(res,result)=>setCookie(res,result.token)});
 app.post('/api/auth/login',async(req,res)=>{const result=await localAuth.login(req.body,req.ip);setCookie(res,result.token);res.json({user:result.user});});
 app.post('/api/auth/logout',async(req,res)=>{await localAuth.logout(tokenFrom(req));setCookie(res,'');res.json({ok:true});});
 app.use('/api',async(req,res,next)=>{
  const currentPath=req.path;
  if(currentPath==='/network')return next();const user=testMode?testUser:await localAuth.authenticate(tokenFrom(req));if(!user)return res.status(401).json({error:'请先登录',loginRequired:true});req.user=user;
  if(currentPath.startsWith('/previews/')&&user.role!=='owner')res.set('Cache-Control','private, no-store');
  if(materialLibraryForbidden(user,currentPath,req.method))return res.status(403).json({error:'单页素材库仅管理员可查看'});
  if(!testMode&&user.role!=='owner'){
   const p=currentPath,mutation=req.method!=='GET';if(mutation&&/^\/(?:templates|references|library|components\/index|material-pages\/(?:rebuild|audits)|skills|chart-prompt|presentation-prompt)/.test(p))return res.status(403).json({error:'共享素材与全局规范由管理员维护'});
   let ok=true;const output=p.match(/^\/(?:outputs|bundles|output-assets)\/([a-f0-9-]{36})/i)||p.match(/^\/files\/([a-f0-9-]{36})\.pptx$/i),job=p.match(/^\/(?:jobs|hermes\/tasks|visual-selections)\/([a-f0-9-]{36})/i),root=p.match(/^\/(?:page-workspaces|page-sessions)\/([a-f0-9-]{36})/i),asset=p.match(/^\/page-assets\/([a-f0-9-]{36})/i),preview=p.match(/^\/previews\/([^/]+)/);
   if(output)ok=await localAuth.ownsOutput(output[1],user);if(job)ok=await localAuth.owns('jobs',job[1],user)||await localAuth.sharedResource('jobs',job[1],user);if(root)ok=await localAuth.owns('roots',root[1],user)||await localAuth.ownsOutput(root[1],user)||await localAuth.sharedResource('roots',root[1],user);if(asset)ok=await localAuth.owns('assets',asset[1],user)||await localAuth.sharedResource('assets',asset[1],user);
   if(output&&mutation&&(/\/(?:organization|restore|purge)$/.test(p)||req.method==='DELETE'))ok=await localAuth.owns('outputs',output[1],user);
   if(p==='/page-sessions')ok=await localAuth.ownsOutput(req.query.outputId,user);if(preview&&preview[1].length>16)ok=await localAuth.ownsOutput(preview[1],user)||await localAuth.owns('previews',preview[1],user);if(req.body?.baseOutputId)ok=ok&&await localAuth.ownsOutput(req.body.baseOutputId,user);
   const inspect=[req.body];let checked=0;while(inspect.length&&ok){const value=inspect.pop();if(!value||typeof value!=='object')continue;if(++checked>30000)return res.status(400).json({error:'请求结构过于复杂'});if(value.type==='image'&&value.assetId)ok=await localAuth.owns('assets',value.assetId,user)||await localAuth.sharedResource('assets',value.assetId,user);if(value.conversationRootId)ok=ok&&(await localAuth.owns('roots',value.conversationRootId,user)||await localAuth.ownsOutput(value.conversationRootId,user)||await localAuth.sharedResource('roots',value.conversationRootId,user));for(const child of Object.values(value))if(child&&typeof child==='object')inspect.push(child);}
   if(!ok)return res.status(403).json({error:'无权访问该作品'});
  }
  const send=res.json.bind(res);res.json=value=>{if(res.statusCode>=400)return send(value);void(async()=>{
   if(currentPath==='/material-recommendations')grantMaterialPreviews(user,value.items);
   if(currentPath==='/studio')grantSourcePreviews(user,value.templates);
   if(currentPath.startsWith('/style-skills')){const cards=value.items||[value];for(const card of cards)if(card.nativeTemplate)grantSourcePreviews(user,[card.nativeTemplate]);}
   if(req.method==='POST'&&value?.id){if(/^\/(?:generate|replace-page-material-job)/.test(currentPath))await localAuth.claim('jobs',value.id,user.id);else if(value.plan&&value.url){const owners=(await localAuth.db()).owners,rootId=value.conversationRootId||value.plan?.conversationRootId;await localAuth.claim('outputs',value.id,owners.roots[rootId]||owners.outputs[rootId]||user.id);}}
   const ownership=(await localAuth.db()).owners;
   if(value?.output?.id){const root=value.output.conversationRootId||value.output.plan?.conversationRootId;await localAuth.claim('outputs',value.output.id,ownership.roots[root]||ownership.outputs[root]||ownership.jobs[value.id]||user.id);}if(value?.rootId&&value?.id&&currentPath.startsWith('/page-sessions'))await localAuth.claim('roots',value.rootId,ownership.roots[value.rootId]||ownership.outputs[value.rootId]||user.id);if(value?.job?.id)await localAuth.claim('jobs',value.job.id,user.id);if(value?.photos)for(const p of value.photos)await localAuth.claim('assets',p.id,user.id);if(value?.headOutputId&&await localAuth.owns('roots',value.rootId,user))await localAuth.claim('outputs',value.headOutputId,ownership.roots[value.rootId]||user.id);if(value?.key&&currentPath.includes('/previews'))await localAuth.claim('previews',value.key,user.id);
   if(value?.plan&&value?.url&&value?.id){await collaboration.observeOutput(value,user);value={...value,publicId:await localAuth.publicId(value.id)};}if(value?.output?.plan&&value.output.id){await collaboration.observeOutput(value.output,user);value={...value,output:{...value.output,publicId:await localAuth.publicId(value.output.id)}};}
   if(user.role!=='owner'){if(currentPath==='/outputs'&&value.items){const visible=[];for(const item of value.items)if(await localAuth.ownsOutput(item.id,user,false))visible.push(item);value={...value,items:visible,total:value.total};}if(currentPath==='/hermes/overview'&&value.tasks?.items){const items=[];for(const item of value.tasks.items)if(await localAuth.owns('jobs',item.id,user))items.push(item);value={...value,tasks:{...value.tasks,items,total:items.length}};}}
   return send(value);
  })().catch(next);return res;};next();
 });
 app.get('/api/admin/users',async(req,res)=>res.json({items:await Promise.all((await localAuth.listUsers(req.user)).map(async user=>({...user,generationQuota:await generationQuota.summary(user)})))}));
 app.post('/api/admin/users',async(req,res)=>res.status(201).json(await localAuth.createUser(req.user,req.body)));
 app.patch('/api/admin/users/:id',async(req,res)=>res.json(await localAuth.manageUser(req.user,req.params.id,req.body)));
 app.post('/api/admin/users/:id/reset-password',async(req,res)=>res.json(await localAuth.resetUserPassword(req.user,req.params.id,req.body.password)));
 app.patch('/api/auth/profile',async(req,res)=>res.json({user:await localAuth.update(req.user.id,req.body,tokenFrom(req))}));
 app.get('/api/links/:token',async(req,res)=>{const id=await localAuth.resolvePublicId(req.params.token);if(!await localAuth.ownsOutput(id,req.user))return res.status(403).json({error:'无权访问该作品'});res.json({outputId:id});});
}
