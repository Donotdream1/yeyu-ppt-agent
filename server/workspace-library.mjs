import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomicUpdateJson} from './atomic-json.mjs';
import {allocateProject,syncProjectOutput} from './project-files.mjs';
import {dataDir} from './library.mjs';

const uuid=/^[a-f0-9-]{36}$/i;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const empty=()=>({folders:[],documents:{},jobs:{}});
export function createWorkspaceLibrary({directory=path.join(dataDir,'user-workspaces')}={}){
 const file=user=>{if(!/^[a-zA-Z0-9_-]{1,80}$/.test(user))throw fail('无效账号');return path.join(directory,user+'.json');};
 const read=async user=>{try{return JSON.parse(await fs.readFile(file(user),'utf8'));}catch(e){if(e.code==='ENOENT')return empty();throw e;}};
 const update=async(user,fn)=>{await fs.mkdir(directory,{recursive:true});return atomicUpdateJson(file(user),empty(),fn);};
 const validateName=name=>{if(typeof name!=='string'||!name.trim()||name.trim().length>60)throw fail('文件夹名称需为1–60个字符');return name.trim().normalize('NFKC');};
 const folderExists=(db,id)=>{if(id!==null&&!db.folders.some(f=>f.id===id))throw fail('文件夹不存在',404);};
 const root=info=>info.conversationRootId||info.plan?.conversationRootId||info.id;
 return {
  read,
  async forgetRoot(user,id){if(!uuid.test(id))throw fail('无效作品编号');await update(user,db=>{delete db.documents[id];});},
  root,
  async folder(user,id){const f=(await read(user)).folders.find(f=>f.id===id);if(!f)throw fail('项目不存在',404);return f;},
  async ensureDisk(user,id,account){let result;await update(user,async db=>{folderExists(db,id);result=db.folders.find(f=>f.id===id);if(!result.diskPath)result.diskPath=await allocateProject(account,result);});return result;},
  async folders(user){return (await read(user)).folders;},
  async createFolder(user,name,options={}){name=validateName(name);const folder={id:randomUUID(),name,createdAt:new Date().toISOString()};await update(user,async db=>{if(db.folders.some(f=>f.name.toLowerCase()===name.toLowerCase()))throw fail('已有同名文件夹',409);if(options.disk)folder.diskPath=await allocateProject(options.account,folder,options.parentPath);db.folders.push(folder);});return folder;},
  async renameFolder(user,id,name){name=validateName(name);await update(user,db=>{folderExists(db,id);if(db.folders.some(f=>f.id!==id&&f.name.toLowerCase()===name.toLowerCase()))throw fail('已有同名文件夹',409);db.folders.find(f=>f.id===id).name=name;});},
  async removeFolder(user,id){await update(user,db=>{folderExists(db,id);if(Object.values(db.documents).some(d=>d.folderId===id&&!d.deletedAt))throw fail('请先移出文件夹中的作品',409);db.folders=db.folders.filter(f=>f.id!==id);for(const d of Object.values(db.documents))if(d.folderId===id)d.folderId=null;for(const key of Object.keys(db.jobs))if(db.jobs[key]===id)db.jobs[key]=null;});},
  async validateFolder(user,id){if(id!==undefined&&id!==null&&!uuid.test(id))throw fail('无效文件夹编号');folderExists(await read(user),id??null);return id??null;},
  async organize(user,info,{folderId,deleted}={}){if(!uuid.test(root(info)))throw fail('无效作品编号');if(folderId){const target=(await read(user)).folders.find(f=>f.id===folderId);if(!target)throw fail('文件夹不存在',404);if(target.diskPath)await syncProjectOutput(target,info);}await update(user,db=>{const key=root(info),current=db.documents[key]||{};if(folderId!==undefined){folderExists(db,folderId);current.folderId=folderId;}if(deleted===true)current.deletedAt=new Date().toISOString();if(deleted===false)delete current.deletedAt;current.updatedAt=new Date().toISOString();db.documents[key]=current;});},
  async recordJob(user,jobId,folderId){if(!uuid.test(jobId))throw fail('无效任务编号');await update(user,db=>{folderExists(db,folderId??null);db.jobs[jobId]=folderId??null;});},
  async attachJobOutput(user,jobId,output){if(!output?.id||output.planningOnly)return;const current=await read(user);if(!Object.hasOwn(current.jobs,jobId)||current.documents[root(output)])return;await update(user,db=>{if(!Object.hasOwn(db.jobs,jobId))return;const key=root(output);if(!db.documents[key])db.documents[key]={folderId:db.folders.some(f=>f.id===db.jobs[jobId])?db.jobs[jobId]:null};});await this.syncKnownOutput(output);},
  async attachKnownJobOutput(jobId,output){for(const name of await fs.readdir(directory).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(!/^[a-zA-Z0-9_-]{1,80}\.json$/.test(name))continue;const user=name.slice(0,-5);if(Object.hasOwn((await read(user)).jobs,jobId))await this.attachJobOutput(user,jobId,output);}},
  async syncKnownOutput(output){for(const name of await fs.readdir(directory).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(!/^[a-zA-Z0-9_-]{1,80}\.json$/.test(name))continue;const db=await read(name.slice(0,-5)),record=db.documents[root(output)],folder=db.folders.find(f=>f.id===record?.folderId);if(folder?.diskPath)await syncProjectOutput(folder,output);}},
  organization(db,info){return db.documents[root(info)]||{};},
 };
}
export const workspaceLibrary=createWorkspaceLibrary();
