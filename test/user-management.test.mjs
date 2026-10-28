import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalAuth} from '../server/local-auth.mjs';
test('用户管理：管理员创建、角色调整、停用、密码重置、移除和恢复，成员不可越权',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-admin-')),auth=createLocalAuth({directory});try{
  const owner=await auth.register({username:'admin',password:'password123'}),member=await auth.register({username:'member',password:'password123'});
  await assert.rejects(auth.listUsers(member.user),/仅管理员/);await assert.rejects(auth.createUser(member.user,{username:'baduser',password:'password123'}),/仅管理员/);
  const created=await auth.createUser(owner.user,{username:'newuser',displayName:'新账号',password:'password123',role:'member'});assert.equal(created.status,'active');assert.ok(!JSON.stringify(await auth.listUsers(owner.user)).match(/hash|salt|password/));
  const login=await auth.login({username:'newuser',password:'password123'});await auth.manageUser(owner.user,created.id,{status:'disabled'});assert.equal(await auth.authenticate(login.token),null);await assert.rejects(auth.login({username:'newuser',password:'password123'}),/账号或密码/);
  await auth.manageUser(owner.user,created.id,{status:'active'});const oldSession=await auth.login({username:'newuser',password:'password123'});await auth.resetUserPassword(owner.user,created.id,'changed-password123');assert.equal(await auth.authenticate(oldSession.token),null);await assert.rejects(auth.login({username:'newuser',password:'password123'}),/账号或密码/);const fresh=await auth.login({username:'newuser',password:'changed-password123'});
  await auth.manageUser(owner.user,created.id,{role:'owner'});assert.equal(await auth.authenticate(fresh.token),null);await auth.manageUser(owner.user,created.id,{status:'removed'});assert.equal((await auth.listUsers(owner.user)).find(u=>u.id===created.id).status,'removed');await auth.manageUser(owner.user,created.id,{role:'member',status:'active'});assert.ok(await auth.login({username:'newuser',password:'changed-password123'}));
  await assert.rejects(auth.manageUser(owner.user,owner.user.id,{role:'member'}),/当前管理员/);await assert.rejects(auth.manageUser(owner.user,owner.user.id,{status:'disabled'}),/当前管理员/);
  const prefs={sidebarCollapsed:false,startPage:'history',fontSize:'large',reducedMotion:true},updated=await auth.update(member.user.id,{preferences:{personalization:prefs}},member.token);assert.deepEqual(updated.preferences.personalization,prefs);await assert.rejects(auth.update(member.user.id,{displayName:'不应写入',newPassword:'new-password',currentPassword:'wrong'},member.token),/当前密码/);assert.equal((await auth.authenticate(member.token)).displayName,'member');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
