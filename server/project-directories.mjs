import fs from 'node:fs/promises';
import path from 'node:path';
import {projectLocation} from './project-files.mjs';
const fail=(m,s=400)=>Object.assign(Error(m),{status:s});
export const withinDirectory=(root,target)=>{const r=path.relative(root,target);return !r||r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
export async function validateProjectParent(user,value,{create=false}={}){
 const loc=await projectLocation(user),raw=value||loc.defaultRoot;
 if(typeof raw!=='string'||!path.isAbsolute(raw)||raw.length>1000||raw.includes('\0'))throw fail('请选择有效的绝对目录');
 const target=path.resolve(raw),allowed=path.resolve(loc.defaultRoot);
 if(user.role!=='owner'&&!withinDirectory(allowed,target))throw fail('请选择当前账号项目目录中的文件夹',403);
 let ancestor=target;while(!await fs.stat(ancestor).then(s=>s.isDirectory(),()=>false)){const next=path.dirname(ancestor);if(next===ancestor)throw fail('目录不存在');ancestor=next;}
 const real=await fs.realpath(ancestor),targetExists=await fs.stat(target).then(s=>s.isDirectory(),()=>false);
 if(user.role!=='owner'){
  await fs.mkdir(allowed,{recursive:true});if(!withinDirectory(await fs.realpath(allowed),real)&&(targetExists||!withinDirectory(real,allowed)))throw fail('目录不能通过链接访问其他账号的文件',403);
 }
 if(create){await fs.mkdir(target,{recursive:true});const resolved=await fs.realpath(target);if(user.role!=='owner'&&!withinDirectory(await fs.realpath(allowed),resolved))throw fail('项目目录超出授权范围',403);await fs.access(resolved,fs.constants.W_OK);return resolved;}
 return target;
}
export async function listProjectDirectories(user,requested){
 const loc=await projectLocation(user),shortcuts=[{name:'我的项目',path:loc.defaultRoot}];
 if(user.role==='owner'){
  shortcuts.unshift({name:'桌面',path:loc.desktop});
  if(process.platform==='win32'){const drives=await Promise.all(Array.from({length:24},(_,i)=>String.fromCharCode(67+i)+':\\').map(async p=>await fs.access(p).then(()=>({name:p.slice(0,2),path:p}),()=>null)));shortcuts.push(...drives.filter(Boolean));}else shortcuts.push({name:'本机目录',path:'/'});
 }
 if(!requested)return {shortcuts,items:[],current:null,parent:null};
 const current=await validateProjectParent(user,requested);if(current===loc.defaultRoot)await fs.mkdir(current,{recursive:true});
 const items=[];for(const e of await fs.readdir(current,{withFileTypes:true})){if(e.name.startsWith('.')||e.name==='$RECYCLE.BIN'||e.name==='System Volume Information')continue;const candidate=path.join(current,e.name);if(e.isDirectory()||e.isSymbolicLink()){try{await validateProjectParent(user,candidate);if((await fs.stat(candidate)).isDirectory())items.push({name:e.name,path:candidate});}catch{}}}
 const parent=path.dirname(current),canParent=parent!==current&&(user.role==='owner'||withinDirectory(loc.defaultRoot,parent));
 return {shortcuts,current,parent:canParent?parent:null,items:items.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true})),canSelect:true};
}
