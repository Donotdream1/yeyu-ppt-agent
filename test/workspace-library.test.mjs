import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createWorkspaceLibrary} from '../server/workspace-library.mjs';
import {outputHistory} from '../server/output-history.mjs';
import {pageSelection,enforcePageSelection,placeSelectedPhotos} from '../server/page-selection.mjs';

test('文件夹按账号保存，支持移动、重命名、回收和恢复整个作品版本链',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-folders-')),store=createWorkspaceLibrary({directory});
 try{const folder=await store.createFolder('alice','工作汇报'),id=randomUUID(),info={id},version={id:randomUUID(),conversationRootId:id};
  assert.equal((await store.folders('alice')).length,1);assert.equal((await store.folders('bob')).length,0);
  await assert.rejects(store.validateFolder('bob',folder.id),/不存在/);await assert.rejects(store.createFolder('alice','工作汇报'),/同名/);
  await store.organize('alice',info,{folderId:folder.id});assert.equal(store.organization(await store.read('alice'),version).folderId,folder.id);
  await assert.rejects(store.removeFolder('alice',folder.id),/移出/);await store.renameFolder('alice',folder.id,'项目复盘');assert.equal((await store.folders('alice'))[0].name,'项目复盘');
  await store.organize('alice',version,{deleted:true});assert.ok(store.organization(await store.read('alice'),info).deletedAt);await store.organize('alice',info,{deleted:false});assert.equal(store.organization(await store.read('alice'),version).deletedAt,undefined);
  await store.organize('alice',info,{folderId:null});await store.removeFolder('alice',folder.id);assert.equal((await store.folders('alice')).length,0);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('文件夹中的生成任务完成后，即使关闭网页仍归入原文件夹',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-jobs-')),store=createWorkspaceLibrary({directory});
 try{const folder=await store.createFolder('alice','科研答辩'),job=randomUUID(),output={id:randomUUID()};await store.recordJob('alice',job,folder.id);await store.attachKnownJobOutput(job,output);assert.equal(store.organization(await store.read('alice'),output).folderId,folder.id);
  await store.organize('alice',output,{folderId:null});await store.attachJobOutput('alice',job,output);assert.equal(store.organization(await store.read('alice'),output).folderId,null);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('作品列表在分页前按权限、文件夹和回收状态筛选',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-history-')),a=randomUUID(),b=randomUUID(),c=randomUUID();
 try{for(const id of [a,b,c]){await fs.writeFile(path.join(folder,id+'.json'),JSON.stringify({id,title:'汇报',pages:2}));await fs.writeFile(path.join(folder,id+'.pptx'),'fixture');}
  const organization=v=>v.id===a?{folderId:'folder-a'}:v.id===b?{deletedAt:'today'}:{};
  const all=await outputHistory({folder,organization});assert.equal(all.total,2);
  assert.equal((await outputHistory({folder,organization,folderId:'folder-a'})).items[0].id,a);
  assert.equal((await outputHistory({folder,organization,folderId:'unfiled'})).items[0].id,c);
  assert.equal((await outputHistory({folder,organization,trash:true})).items[0].id,b);
  assert.equal((await outputHistory({folder,organization,canAccess:async id=>id!==a})).total,1);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('对象选区限制真实对象及组合子对象，拒绝越界和过期选区',()=>{
 const inspection={fingerprint:'current',shapes:[{id:1,type:'group',box:{x:.1,y:.2,w:.4,h:.3}},{id:2,parentId:1,type:'text',box:{x:.2,y:.3,w:.2,h:.1}},{id:3,type:'text',box:{x:.7,y:.2,w:.2,h:.1}}]};
 const selection=pageSelection({shapeIds:[1],fingerprint:'current'},inspection);assert.deepEqual([...selection.allowedIds],[1,2]);
 assert.equal(enforcePageSelection({operations:[{type:'text',shapeId:2,text:'修改'}]},selection).operations.length,1);
 assert.throws(()=>enforcePageSelection({operations:[{type:'text',shapeId:3,text:'错选'}]},selection),/超出/);
 assert.throws(()=>enforcePageSelection({operations:[{type:'shape',box:{x:.8,y:.2,w:.1,h:.1}}]},selection),/选区内/);
 assert.throws(()=>pageSelection({shapeIds:[1],fingerprint:'old'},inspection),/版本已变化/);
 assert.throws(()=>pageSelection({shapeIds:[7],fingerprint:'current'},inspection),/不在当前页/);
 assert.throws(()=>placeSelectedPhotos([{type:'image',assetId:'photo',targetShapeId:2}],[{type:'image',assetId:'photo',targetShapeId:3}],selection),/超出/);
});
