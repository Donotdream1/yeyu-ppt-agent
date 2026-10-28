import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {listProjectDirectories,validateProjectParent} from '../server/project-directories.mjs';
import {allocateProject,projectLocation} from '../server/project-files.mjs';
test('目录浏览器支持用户选择桌面以外的保存位置，独立新建项目且不覆盖文件',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-path-picker-')),old={node:process.env.NODE_ENV,projects:process.env.PROJECTS_ROOT};process.env.NODE_ENV='test';process.env.PROJECTS_ROOT=path.join(root,'desktop');
 try{const owner={id:'owner-test',role:'owner'},selected=path.join(root,'selected-location');await fs.mkdir(selected);await fs.writeFile(path.join(selected,'existing.txt'),'不要覆盖');const view=await listProjectDirectories(owner,root);assert.ok(view.items.some(i=>i.path===selected));const folder={id:randomUUID(),name:'自选保存位置',createdAt:new Date().toISOString()},created=await allocateProject(owner,folder,selected);assert.equal(path.dirname(created),selected);assert.equal(await fs.readFile(path.join(selected,'existing.txt'),'utf8'),'不要覆盖');assert.ok((await fs.stat(path.join(created,'project.json'))).isFile());
 const member={id:'member-test',role:'member'},loc=await projectLocation(member);await assert.rejects(validateProjectParent(member,selected),/当前账号/);const own=await listProjectDirectories(member,loc.defaultRoot);assert.equal(own.parent,null);assert.equal(own.current,loc.defaultRoot);await assert.rejects(validateProjectParent(owner,'../relative'),/绝对目录/);
 const link=path.join(loc.defaultRoot,'escape');await fs.symlink(selected,link,process.platform==='win32'?'junction':'dir');await assert.rejects(validateProjectParent(member,link),/链接/);assert.ok(!(await listProjectDirectories(member,loc.defaultRoot)).items.some(i=>i.name==='escape'));await fs.unlink(link);
 }finally{if(old.node===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old.node;if(old.projects===undefined)delete process.env.PROJECTS_ROOT;else process.env.PROJECTS_ROOT=old.projects;await fs.rm(root,{recursive:true,force:true});}
});
