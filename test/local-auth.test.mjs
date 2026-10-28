import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalAuth} from '../server/local-auth.mjs';
import {readWorkspaceLocation,presentationPath} from '../src/lib/routes.js';
import {allowedLocalOrigin,networkInfo} from '../server/network.mjs';

test('注册、登录、退出使用密码哈希及随机会话，首个账号为管理员',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-auth-')),auth=createLocalAuth({directory});
 try{const a=await auth.register({username:'owner',displayName:'管理者',password:'unit-password-123'}),b=await auth.register({username:'member',password:'member-password-456'});assert.equal(a.user.role,'owner');assert.equal(b.user.role,'member');assert.equal((await auth.authenticate(a.token)).id,a.user.id);await assert.rejects(auth.login({username:'owner',password:'wrong'}),/账号或密码/);const logged=await auth.login({username:'owner',password:'unit-password-123'});assert.notEqual(logged.token,a.token);const saved=await fs.readFile(path.join(directory,'accounts.json'),'utf8');assert.ok(!saved.includes('unit-password-123'));assert.ok(!saved.includes(a.token));assert.ok(!('hash' in a.user));await auth.logout(a.token);assert.equal(await auth.authenticate(a.token),null);
 const changed=await auth.update(a.user.id,{displayName:'新名称',newPassword:'changed-password',currentPassword:'unit-password-123'},logged.token);assert.equal(changed.displayName,'新名称');await assert.rejects(auth.login({username:'owner',password:'unit-password-123'}));assert.ok(await auth.login({username:'owner',password:'changed-password'}));}finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('加密网址只含ASCII，支持持久化恢复，篡改不可解密',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-links-')),auth=createLocalAuth({directory}),id='aaaaaaaa-1111-4111-8111-111111111111';
 try{const token=await auth.publicId(id);assert.match(token,/^v1\.[A-Za-z0-9_.-]+$/);assert.ok(!token.includes(id));assert.equal(await auth.resolvePublicId(token),id);assert.equal(await auth.publicId(id),token);assert.equal(await createLocalAuth({directory}).resolvePublicId(token),id);await assert.rejects(auth.resolvePublicId(token.slice(0,-4)+'AAAA'),/链接无效/);const url=presentationPath(token,5),route=readWorkspaceLocation({pathname:url});assert.equal(route.publicId,token);assert.equal(route.outputId,null);assert.equal(route.page,5);assert.ok(!/[\u4e00-\u9fff]/.test(url));}finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('普通账号不继承其他用户作品与照片权限',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-acl-')),auth=createLocalAuth({directory});try{const owner=await auth.register({username:'owner',password:'owner-password'}),a=await auth.register({username:'alice',password:'alice-password'}),b=await auth.register({username:'bob',password:'bob-password'});await auth.claim('outputs','first',a.user.id);await auth.claim('assets','photo',a.user.id);assert.equal(await auth.owns('outputs','first',a.user),true);assert.equal(await auth.owns('outputs','first',b.user),false);assert.equal(await auth.owns('assets','photo',b.user),false);assert.equal(await auth.owns('outputs','first',owner.user),true);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('旧链接与新的英文页码路径兼容，本机局域网来源校验不放行外站',()=>{
 const id='aaaaaaaa-1111-4111-8111-111111111111';assert.deepEqual(readWorkspaceLocation({pathname:'/',search:'?v=30&output='+id+'&page=6'}).page,5);assert.equal(readWorkspaceLocation({pathname:'/presentations/'+id+'/pages/6'}).outputId,id);assert.equal(allowedLocalOrigin('https://evil.example',3210),false);assert.equal(allowedLocalOrigin('http://127.0.0.1:3210',3210),true);assert.equal(allowedLocalOrigin('http://127.0.0.1:9999',3210),false);for(const ip of networkInfo(3210).addresses)assert.equal(allowedLocalOrigin('http://'+ip+':3210',3210),true);
});
