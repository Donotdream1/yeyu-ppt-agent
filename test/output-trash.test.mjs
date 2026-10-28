import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {purgeTrashedOutputs,confinedDeletionPath} from '../server/output-trash.mjs';
test('回收站永久删除整条版本与项目导出副本，保留原文、素材及其他作品；权限和路径先校验',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-purge-')),id=randomUUID(),version=randomUUID(),other=randomUUID(),user={id:'test-owner',role:'owner'},project=path.join(directory,'project');
 for(const p of ['outputs','previews','sources','project/outputs','project/sources'])await fs.mkdir(path.join(directory,p),{recursive:true});
 for(const [output,root]of [[id,id],[version,id],[other,other]]){await fs.writeFile(path.join(directory,'outputs',output+'.json'),JSON.stringify({id:output,conversationRootId:root}));for(const ext of ['pptx','zip'])await fs.writeFile(path.join(directory,'outputs',output+'.'+ext),'fixture');await fs.mkdir(path.join(directory,'outputs',output));await fs.mkdir(path.join(directory,'previews',output));await fs.writeFile(path.join(directory,'previews',output,'1.png'),'preview');}
 await fs.writeFile(path.join(directory,'sources','template.pptx'),'原始素材');await fs.writeFile(path.join(project,'sources','source.docx'),'原始文档');await fs.writeFile(path.join(project,'outputs','deleted.pptx'),'deleted');await fs.writeFile(path.join(project,'outputs','kept.pptx'),'kept');await fs.writeFile(path.join(project,'outputs','latest.pptx'),'deleted');await fs.writeFile(path.join(project,'project.json'),JSON.stringify({files:[{name:'source.docx'}],versions:[{outputId:id,relative:'outputs/deleted.pptx'},{outputId:other,relative:'outputs/kept.pptx',createdAt:new Date().toISOString()}],latestOutputId:id}));
 const db={documents:{[id]:{deletedAt:new Date().toISOString()},[other]:{}},folders:[{diskPath:project}]},workspace={read:async()=>db,forgetRoot:async(_,root)=>delete db.documents[root]},auth={db:async()=>({owners:{outputs:{[id]:user.id,[version]:user.id,[other]:'someone-else'},roots:{}}}),ownsOutput:async()=>true,owns:async()=>true};
 try{
  await assert.rejects(purgeTrashedOutputs(user,{ids:[other]},{directory,workspace,auth}),/回收站/);await assert.rejects(purgeTrashedOutputs({...user,id:'other-user'},{ids:[id]},{directory,workspace,auth}),/其他账号/);await assert.rejects(purgeTrashedOutputs(user,{ids:['../escape']},{directory,workspace,auth}),/请选择/);assert.throws(()=>confinedDeletionPath(path.join(directory,'outputs'),'../sources/template.pptx'),/超出/);
  const result=await purgeTrashedOutputs(user,{ids:[version]},{directory,workspace,auth});assert.equal(result.versions,2);assert.equal(result.count,1);for(const output of [id,version])for(const ext of ['json','pptx','zip'])assert.equal(await fs.access(path.join(directory,'outputs',output+'.'+ext)).then(()=>true,()=>false),false);assert.equal(await fs.readFile(path.join(directory,'sources','template.pptx'),'utf8'),'原始素材');assert.equal(await fs.readFile(path.join(project,'sources','source.docx'),'utf8'),'原始文档');assert.equal(await fs.readFile(path.join(project,'outputs','latest.pptx'),'utf8'),'kept');assert.ok(await fs.stat(path.join(directory,'outputs',other+'.pptx')));assert.equal(JSON.parse(await fs.readFile(path.join(project,'project.json'),'utf8')).versions.length,1);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
