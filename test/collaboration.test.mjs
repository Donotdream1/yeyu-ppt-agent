import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createCollaboration} from '../server/collaboration.mjs';
test('collaboration: ACL, curated previews, editing, comments, presenter conflicts and revocation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-collab-'));try{
  const outputs=path.join(dir,'outputs'),docs=path.join(dir,'documents');await fs.mkdir(outputs);await fs.mkdir(docs);
  const owner={id:randomUUID(),username:'owner-a',role:'member'},viewer={id:randomUUID(),username:'viewer-a',role:'member'},editor={id:randomUUID(),username:'editor-a',role:'member'},stranger={id:randomUUID(),role:'member'};
  const id=randomUUID(),info={id,title:'Test deck',pages:2,createdAt:new Date().toISOString(),plan:{sourceText:'SECRET DOCUMENT',slides:[{title:'One',notes:'PRIVATE NOTES'},{title:'Two'}]}};await fs.writeFile(path.join(outputs,id+'.json'),JSON.stringify(info));
  const c=createCollaboration({directory:dir,outputDirectory:outputs,documentDirectory:docs}),room=await c.create(owner,info);
  await assert.rejects(c.view(room.id,stranger),e=>e.status===403);await c.invite(room.id,owner,viewer,'viewer');await c.invite(room.id,owner,editor,'editor');
  const read=await c.view(room.id,viewer);assert.equal(read.canEdit,false);assert.ok(!JSON.stringify(read).includes('SECRET'));assert.ok(!JSON.stringify(read).includes('PRIVATE'));assert.equal(await c.canEditOutput(id,viewer),false);assert.equal(await c.canEditOutput(id,editor),true);
  await assert.rejects(c.present(room.id,viewer,{action:'start'}),e=>e.status===403);await assert.rejects(c.invite(room.id,editor,stranger,'editor'),e=>e.status===403);await assert.rejects(c.create(editor,info,owner.id),e=>e.status===403);
  await c.comment(room.id,viewer,{page:1,text:'Please clarify'});assert.equal((await c.view(room.id,owner)).comments.length,1);
  let v=await c.present(room.id,owner,{action:'start',expectedVersion:0});assert.equal(v.presentation.version,1);await assert.rejects(c.present(room.id,editor,{action:'start',expectedVersion:1}),e=>e.status===409);
  v=await c.present(room.id,owner,{action:'page',page:1,expectedVersion:1});assert.equal(v.presentation.page,1);await assert.rejects(c.present(room.id,owner,{action:'page',page:0,expectedVersion:1}),e=>e.status===409);
  let snapshot,revoked;const first=new Promise(r=>{snapshot=r;}),withdrawn=new Promise(r=>{revoked=r;});const stop=c.subscribe(room.id,viewer,e=>{if(e.type==='snapshot')snapshot(e);if(e.type==='revoked')revoked(e);});
  const within=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('missing collaboration event')),5000);})]);}finally{clearTimeout(timer);}};
  assert.equal((await within(first)).type,'snapshot');await c.remove(room.id,owner,viewer.id);assert.equal((await within(withdrawn)).type,'revoked');stop();await assert.rejects(c.view(room.id,viewer),e=>e.status===403);
  const second={...info,id:randomUUID(),conversationRootId:id,title:'Updated',createdAt:new Date(Date.now()+1000).toISOString()};await fs.writeFile(path.join(outputs,second.id+'.json'),JSON.stringify(second));await fs.writeFile(path.join(docs,id+'.json'),JSON.stringify({headOutputId:second.id}));assert.equal((await c.view(room.id,editor)).outputId,second.id);
  assert.equal((await c.list(stranger)).length,0);assert.equal((await c.list(editor)).length,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
