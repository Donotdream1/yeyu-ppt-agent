import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {atomicUpdateJson} from './atomic-json.mjs';
import {dataDir} from './library.mjs';
const exec=promisify(execFile),fail=(m,s=400)=>Object.assign(Error(m),{status:s});
let desktop;
export async function desktopRoot(){
 if(process.env.NODE_ENV==='test'&&process.env.PROJECTS_ROOT)return path.resolve(process.env.PROJECTS_ROOT);
 if(!desktop)desktop=(async()=>{if(process.platform==='win32'){const r=await exec('powershell.exe',['-NoProfile','-Command',"[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Environment]::GetFolderPath('Desktop')"],{windowsHide:true});if(r.stdout.trim())return r.stdout.trim();}return path.join(os.homedir(),'Desktop');})();
 return desktop;
}
const within=(root,target)=>{const rel=path.relative(root,target);return !rel||!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
const safeName=s=>String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,80)||'project';
export async function projectLocation(user){const desktop=await desktopRoot();return {desktop,defaultRoot:path.join(desktop,'叙帧项目',user.id.slice(0,8))};}
export async function allocateProject(user,folder,parentPath){
 const {validateProjectParent}=await import('./project-directories.mjs');
 const parent=await validateProjectParent(user,parentPath,{create:true});
 const directory=path.join(parent,safeName(folder.name)+'-'+folder.id.slice(0,8));await fs.mkdir(directory,{recursive:false});
 for(const child of ['sources','outputs','skills'])await fs.mkdir(path.join(directory,child));
 await fs.writeFile(path.join(directory,'project.json'),JSON.stringify({id:folder.id,name:folder.name,createdAt:folder.createdAt,files:[],versions:[]},null,2));
 return directory;
}
async function manifest(folder){if(!folder.diskPath)throw fail('此项目尚未关联桌面目录');return JSON.parse(await fs.readFile(path.join(folder.diskPath,'project.json'),'utf8'));}
export async function projectFiles(folder){return manifest(folder);}
export async function storeProjectFile(folder,buffer,name,{role='source'}={}){
 const extension=path.extname(name).toLowerCase();if(!['.pptx','.docx','.pdf','.md','.txt','.csv','.tsv','.json','.xlsx','.png','.jpg','.jpeg','.webp','.zip'].includes(extension))throw fail('此文件类型不能加入项目');
 const id=randomUUID(),file={id,name:safeName(name),role,size:buffer.length,createdAt:new Date().toISOString(),relative:path.join(role==='skill'?'skills':'sources',id.slice(0,8)+'-'+safeName(name))};
 await fs.writeFile(path.join(folder.diskPath,file.relative),buffer,{flag:'wx'});await atomicUpdateJson(path.join(folder.diskPath,'project.json'),{},db=>{(db.files||=[]).push(file);});return {...file,url:'/api/projects/'+folder.id+'/files/'+id};
}
export async function resolveProjectFile(folder,id){const m=await manifest(folder),f=m.files.find(f=>f.id===id);if(!f)throw fail('项目文件不存在',404);const target=path.resolve(folder.diskPath,f.relative);if(!within(folder.diskPath,target))throw fail('文件路径无效');return {...f,path:target};}
export async function syncProjectOutput(folder,output){
 if(!folder?.diskPath||!output?.id||!output.url)return;
 const existing=await manifest(folder);if(existing.versions.some(v=>v.outputId===output.id))return;
 const name=safeName(output.title||output.plan?.title||'演示稿')+'-'+output.id.slice(0,8)+'.pptx',relative=path.join('outputs',name),source=path.join(dataDir,'outputs',output.id+'.pptx');
 await fs.copyFile(source,path.join(folder.diskPath,relative));
 await atomicUpdateJson(path.join(folder.diskPath,'project.json'),{},async db=>{if(Date.parse(output.createdAt||0)>=Date.parse(db.latestCreatedAt||0)||!db.latestOutputId){const latest=path.join(folder.diskPath,'outputs','latest.pptx'),tmp=latest+'.tmp';await fs.copyFile(source,tmp);try{await fs.rename(tmp,latest);delete db.latestPending;}catch(e){if(!['EBUSY','EPERM','EACCES'].includes(e.code))throw e;db.latestPending=true;await fs.unlink(tmp).catch(()=>{});}db.latestOutputId=output.id;db.latestCreatedAt=output.createdAt;}db.updatedAt=new Date().toISOString();if(!(db.versions||=[]).some(v=>v.outputId===output.id))db.versions.push({outputId:output.id,title:output.title,relative,createdAt:output.createdAt});});
}
