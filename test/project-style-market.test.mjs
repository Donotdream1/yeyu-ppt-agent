import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {allocateProject,projectFiles,storeProjectFile,resolveProjectFile,syncProjectOutput} from '../server/project-files.mjs';
import {listStyleSkills,importStyleSkill,editStyleSkill,applyStyleSkill,extractPptStyle,deleteStyleSkills,docxStyleEvidence} from '../server/style-market.mjs';
import {dataDir} from '../server/library.mjs';
import {frameworkFile} from '../server/hermes-journal.mjs';
import JSZip from 'jszip';

test('项目在桌面范围创建真实目录，资料入索引，阻止目录穿越',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-project-')),old={node:process.env.NODE_ENV,root:process.env.PROJECTS_ROOT};process.env.NODE_ENV='test';process.env.PROJECTS_ROOT=dir;
 try{const user={id:'project-test',role:'member'},folder={id:randomUUID(),name:'设计项目',createdAt:new Date().toISOString()};folder.diskPath=await allocateProject(user,folder);
  assert.ok((await fs.stat(path.join(folder.diskPath,'project.json'))).isFile());const f=await storeProjectFile(folder,Buffer.from('原始需求文档'), '需求.txt');assert.equal((await projectFiles(folder)).files.length,1);assert.equal(await fs.readFile((await resolveProjectFile(folder,f.id)).path,'utf8'),'原始需求文档');
  const output={id:randomUUID(),title:'项目成稿',url:'/file',createdAt:'2026-10-28T02:00:00Z'};await fs.writeFile(path.join(dataDir,'outputs',output.id+'.pptx'),'native-pptx-fixture');try{await syncProjectOutput(folder,output);await syncProjectOutput(folder,output);const m=await projectFiles(folder);assert.equal(m.latestOutputId,output.id);assert.equal(m.versions.length,1);assert.equal(await fs.readFile(path.join(folder.diskPath,'outputs','latest.pptx'),'utf8'),'native-pptx-fixture');}finally{await fs.unlink(path.join(dataDir,'outputs',output.id+'.pptx'));}
  await assert.rejects(allocateProject(user,{...folder,id:randomUUID()},path.dirname(dir)),/当前账号项目目录/);await assert.rejects(storeProjectFile(folder,Buffer.from('test'),'run.exe'),/不能加入项目/);
 }finally{if(old.node===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old.node;if(old.root===undefined)delete process.env.PROJECTS_ROOT;else process.env.PROJECTS_ROOT=old.root;await fs.rm(dir,{recursive:true,force:true});}
});
test('SKILL导入、审核与应用按账号隔离，不自动执行压缩包脚本',async()=>{
 const user='style-test-'+randomUUID(),source='---\nname: leadership-style\ndescription: 适合领导汇报的版式\n---\n# 汇报规范\n标题简短，使用真实素材原色，正文保持可编辑。';
 try{const item=await importStyleSkill(user,Buffer.from(source),'SKILL.md');assert.equal(item.status,'ready');assert.ok(!(await listStyleSkills('other-user')).some(s=>s.id===item.id));await editStyleSkill(user,item.id,{fontFamily:'Arial',content:source+'\n正文采用Arial。'});const body=await applyStyleSkill(user,{styleSkillId:item.id,document:'用户文档'});assert.equal(body.styleSkillSnapshot.fontFamily,'Arial');assert.ok(body.styleSkillSnapshot.content.includes('Arial'));await editStyleSkill(user,item.id,{status:'draft'});await assert.rejects(applyStyleSkill(user,{styleSkillId:item.id}),/审核并启用/);await assert.rejects(importStyleSkill(user,Buffer.from('没有文件头'),'SKILL.md'),/name与description/);await deleteStyleSkills(user,[item.id]);assert.ok(!(await listStyleSkills(user)).some(s=>s.id===item.id));}
 finally{await fs.rm(path.join(dataDir,'style-market',user),{recursive:true,force:true});}
});
test('PPT风格解析输出实际画布、字号及对象证据',async()=>{
 const result=await extractPptStyle(await fs.readFile(new URL('../server/base.pptx',import.meta.url)));assert.ok(result.totalPages>0);assert.ok(result.canvas.widthCm>0);assert.ok(result.canvas.heightCm>0);assert.equal(result.layouts.length,result.analyzedPages);assert.match(result.evidence,/原生对象/);
});
test('框架文件仅开放项目源码，不允许读取配置或穿越路径',async()=>{
 await assert.rejects(frameworkFile('../.env'),/只能查看/);await assert.rejects(frameworkFile('.env'),/只能查看/);await assert.rejects(frameworkFile('C:/secret.py'),/只能查看/);
});
test('ZIP版式导入文本参考并按需进入实际技能上下文，脚本不导入',async()=>{
 const user='zip-test-'+randomUUID(),zip=new JSZip();zip.file('my-style/SKILL.md','---\nname: zip-layout\ndescription: 带有参考文档的版式\n---\n请读取 references/layout.md 的规则。');zip.file('my-style/references/layout.md','主标题使用简明结论，采用三列并列结构。');zip.file('my-style/scripts/run.py','print("never execute")');
 try{const item=await importStyleSkill(user,await zip.generateAsync({type:'nodebuffer'}),'style.zip');assert.equal(item.references.length,1);const applied=await applyStyleSkill(user,{styleSkillId:item.id});assert.match(applied.styleSkillSnapshot.content,/三列并列结构/);assert.deepEqual(applied.styleSkillSnapshot.loadedReferenceFiles,['references/layout.md']);assert.equal(await fs.stat(path.join(dataDir,'style-market',user,item.id,'scripts','run.py')).then(()=>true,()=>false),false);}
 finally{await fs.rm(path.join(dataDir,'style-market',user),{recursive:true,force:true});}
});
test('DOCX字号按半磅转换，并区分文档样式与PPT规范',async()=>{
 const zip=new JSZip();zip.file('word/styles.xml','<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:styleId="Heading1"><w:name w:val="标题1"/><w:rPr><w:rFonts w:eastAsia="微软雅黑"/><w:sz w:val="32"/></w:rPr></w:style></w:styles>');const observed=await docxStyleEvidence(await zip.generateAsync({type:'nodebuffer'}));assert.equal(observed.fontSizesPt[0].value,'16');assert.equal(observed.styleDefinitions[0].font,'微软雅黑');assert.match(observed.evidence,/不等同/);
});
