import fs from 'node:fs/promises';
import path from 'node:path';
import {dataDir} from './library.mjs';
import {workspaceLibrary} from './workspace-library.mjs';
import {localAuth} from './local-auth.mjs';
import {atomicUpdateJson} from './atomic-json.mjs';
const uuid=/^[a-f0-9-]{36}$/i,fail=(m,s=400)=>Object.assign(Error(m),{status:s});
const rootOf=x=>x.conversationRootId||x.plan?.conversationRootId||x.id;
export function confinedDeletionPath(root,...parts){const base=path.resolve(root),target=path.resolve(base,...parts),rel=path.relative(base,target);if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw fail('删除路径超出作品目录');return target;}
const purging=new Set();
export async function purgeTrashedOutputs(user,{ids,all=false}={}, {directory=dataDir,workspace=workspaceLibrary,auth=localAuth}={}){
 const db=await workspace.read(user.id),infos=[];
 if(!all&&(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>!uuid.test(id))))throw fail('请选择回收站中的作品');
 for(const file of await fs.readdir(path.join(directory,'outputs'))){if(!/^[a-f0-9-]{36}\.json$/i.test(file))continue;try{infos.push(JSON.parse(await fs.readFile(path.join(directory,'outputs',file),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}}
 const roots=new Set();if(all){for(const x of infos)if(db.documents[rootOf(x)]?.deletedAt)roots.add(rootOf(x));}else for(const id of ids){const info=infos.find(x=>x.id===id);if(!info)throw fail('作品已删除或不存在',404);const root=rootOf(info);if(!db.documents[root]?.deletedAt)throw fail('只能永久删除回收站中的作品');roots.add(root);}
 const ownership=(await auth.db()).owners;
 const {pageWorkspaceIsBusy}=await import('./page-workspace.mjs');for(const root of roots)if(pageWorkspaceIsBusy(root))throw fail('此作品仍有页面正在修改，请等待完成后删除',409);
 for(const root of roots){const owner=ownership.roots?.[root]||ownership.outputs?.[root];if(owner&&owner!==user.id)throw fail('不能永久删除其他账号的作品',403);if(!await auth.ownsOutput(root,user)&&!await auth.owns('roots',root,user))throw fail('无权删除此作品',403);if(purging.has(root))throw fail('此作品正在删除，请稍后刷新',409);}
 const targets=infos.filter(x=>roots.has(rootOf(x)));for(const x of targets){const owner=ownership.outputs?.[x.id];if(owner&&owner!==user.id)throw fail('作品版本属于其他账号',403);}
 for(const root of roots)purging.add(root);
 try{
  const outputIds=new Set(targets.map(x=>x.id));
  // Delete only exported copies indexed in this account's own project manifest.
  // Source documents, uploaded images, styles and reference PPTs are untouched.
  for(const folder of db.folders.filter(f=>f.diskPath)){
   const manifest=path.join(folder.diskPath,'project.json');let m;try{m=JSON.parse(await fs.readFile(manifest,'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
   const removed=(m.versions||[]).filter(v=>outputIds.has(v.outputId));if(!removed.length)continue;
   const exports=path.join(folder.diskPath,'outputs');for(const v of removed){const target=confinedDeletionPath(folder.diskPath,v.relative);confinedDeletionPath(exports,path.relative(exports,target));if(!/\.pptx$/i.test(target))throw fail('项目导出索引无效');await fs.rm(target,{force:true});}
   await atomicUpdateJson(manifest,{},async current=>{current.versions=(current.versions||[]).filter(v=>!outputIds.has(v.outputId));if(outputIds.has(current.latestOutputId)){const newest=current.versions.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0],latest=confinedDeletionPath(exports,'latest.pptx');if(newest){const source=confinedDeletionPath(folder.diskPath,newest.relative);await fs.copyFile(source,latest);current.latestOutputId=newest.outputId;current.latestCreatedAt=newest.createdAt;}else{await fs.rm(latest,{force:true});delete current.latestOutputId;delete current.latestCreatedAt;}}current.updatedAt=new Date().toISOString();});
  }
  for(const x of targets){if(!uuid.test(x.id))throw fail('作品版本编号无效');for(const ext of ['pptx','zip','json'])await fs.rm(confinedDeletionPath(path.join(directory,'outputs'),x.id+'.'+ext),{force:true});for(const root of ['outputs','previews']){const target=confinedDeletionPath(path.join(directory,root),x.id);const stat=await fs.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(stat?.isSymbolicLink())await fs.unlink(target);else if(stat)await fs.rm(target,{recursive:true,force:true});}}
  for(const root of roots)await workspace.forgetRoot(user.id,root);
  return {ok:true,count:roots.size,versions:targets.length};
 }catch(e){if(['EPERM','EBUSY','EACCES'].includes(e.code))throw fail('有文件正在被占用，请关闭对应PPT后重试永久删除',409);throw e;}
 finally{for(const root of roots)purging.delete(root);}
}
