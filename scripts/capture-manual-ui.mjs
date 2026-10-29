// Reproducible documentation screenshots from an isolated, synthetic workspace.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-manual-')),out=path.join(root,'docs/manual/screenshots');
const {hermesRuntimePaths}=await import('../server/hermes-runtime.mjs'),runtime=hermesRuntimePaths({root});
let child,browser;const errors=[];
try{
 process.chdir(temporary);process.env.NODE_ENV='test';process.env.AUTH_DATA_DIR=path.join(temporary,'auth');process.env.PROJECTS_ROOT=path.join(temporary,'projects');process.env.HERMES_SOURCE_PATH=runtime.sourcePath;process.env.HERMES_PYTHON=runtime.pythonPath;delete process.env.AUTH_TEST_MODE;delete process.env.DEEPSEEK_API_KEY;
 await fs.mkdir(out,{recursive:true});await fs.mkdir('server');await fs.copyFile(path.join(root,'server/base.pptx'),'server/base.pptx');await fs.cp(path.join(root,'dist'),'dist',{recursive:true});await fs.cp(path.join(root,'agents/skills'),'agents/skills',{recursive:true});await fs.cp(path.join(root,'agents/vendor'),'agents/vendor',{recursive:true});
 const {prepareTestFixtures}=await import('./test-fixtures.mjs');await prepareTestFixtures();
 const {localAuth}=await import('../server/local-auth.mjs'),{dataDir,builtinAssets}=await import('../server/library.mjs'),{createDeck}=await import('../server/ooxml.mjs'),{workspaceLibrary}=await import('../server/workspace-library.mjs');
 const admin=await localAuth.register({username:'demo-admin',displayName:'示例管理员',password:randomUUID()}),member=await localAuth.register({username:'demo-member',displayName:'示例用户',password:randomUUID()}),folder=await workspaceLibrary.createFolder(admin.user.id,'示例工作汇报项目');
 const id=randomUUID(),slides=[{title:'年度工作汇报',kind:'cover',bullets:[],assetId:'builtin-cover'},{title:'重点工作与后续计划',kind:'content',visual:'parallel',bullets:['质量改善：记录检验问题并落实整改。','设备维护：按计划检查运行状态。','人才培养：开展岗位培训与验证。'],assetId:'builtin-content'}],deck=await createDeck(slides,builtinAssets,()=>{}),info={id,title:'示例年度工作汇报',pages:2,createdAt:new Date().toISOString(),url:'/api/files/'+id+'.pptx',bundleUrl:'/api/bundles/'+id,render:{status:'ready',pages:2},plan:{title:'示例年度工作汇报',sourceName:'示例文档.txt',sourceText:'本项目为说明书界面示例，使用虚构的演示内容，不代表实际业绩。',slides},audit:[],charts:[],warnings:[]};
 await fs.mkdir(path.join(dataDir,'outputs'),{recursive:true});await fs.writeFile(path.join(dataDir,'outputs',id+'.json'),JSON.stringify(info));await fs.writeFile(path.join(dataDir,'outputs',id+'.pptx'),deck.buffer);await localAuth.claim('outputs',id,admin.user.id);await workspaceLibrary.organize(admin.user.id,info,{folderId:folder.id});
 const previews=path.join(dataDir,'previews',id);await fs.mkdir(previews,{recursive:true});
 for(let p=1;p<=2;p++)await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="white"/><text x="70" y="115" font-family="Microsoft YaHei" font-size="42" font-weight="bold" fill="#164C78">${p===1?'年度工作汇报':'重点工作与后续计划'}</text>${p===1?'<text x="70" y="210" font-family="Microsoft YaHei" font-size="26" fill="#666">示例项目 · 2026年</text>':['质量改善','设备维护','人才培养'].map((s,i)=>`<rect x="${70+i*400}" y="220" width="370" height="290" rx="12" fill="#edf2fc"/><text x="${115+i*400}" y="290" font-family="Microsoft YaHei" font-size="30" fill="#164C78">${s}</text><text x="${110+i*400}" y="365" font-family="Microsoft YaHei" font-size="23" fill="#202020">填写对应工作与证据</text>`).join('')}<text x="1150" y="680" font-family="Arial" font-size="18">${p}/2</text></svg>`)).png().toFile(path.join(previews,p+'.png'));
 const stoppedId=randomUUID(),stopped={id:stoppedId,status:'stopped',phase:'已停止，进度已保存',resumable:true,createdAt:new Date().toISOString(),body:{title:'示例工作汇报',taskKind:'generation'},plan:info.plan,progress:{stage:'writing',totalPages:2,completedPages:[1],activePages:[],failedPages:[],modelRequests:3,elapsedMs:18000},runs:[],workflowTrace:[{name:'逐页内容规划',skill:'ppt-writing',at:new Date().toISOString()},{name:'本页素材与文案适配',skill:'material-use',at:new Date().toISOString()}]};
 await fs.mkdir(path.join(dataDir,'workflows'),{recursive:true});await fs.writeFile(path.join(dataDir,'workflows',stoppedId+'.json'),JSON.stringify(stopped));await localAuth.claim('jobs',stoppedId,admin.user.id);
 const {collaboration}=await import('../server/collaboration.mjs');const room=await collaboration.create(admin.user,info);await collaboration.comment(room.id,admin.user,{page:1,text:'示例评论：请补充对应任务的验证证据。'});
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
 child=spawn(process.execPath,[path.join(root,'server/index.mjs'),'--production'],{cwd:temporary,env:{...process.env,PORT:String(port),BIND_ADDRESS:'127.0.0.1'},windowsHide:true,stdio:['ignore','pipe','pipe']});child.stderr.on('data',d=>errors.push(String(d)));child.stdout.on('data',()=>{});
 for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(errors.join(''));try{if((await fetch(base+'/api/network')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const {chromium}=await import('playwright');browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/network',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({port:3210,addresses:['192.0.2.10'],localUrl:'http://127.0.0.1:3210',lanUrls:['http://192.0.2.10:3210']})}));
 const shot=async(name,url)=>{if(url)await page.goto(base+url);await page.waitForTimeout(1200);const selector=['01-login','02-register'].includes(name)?'.auth-form':name==='05-new-project'?'.project-create-dialog':null;if(selector)await page.locator(selector).screenshot({path:path.join(out,name+'.png')});else await page.screenshot({path:path.join(out,name+'.png')});console.log('Captured '+name);};
 await shot('01-login','/login');await shot('02-register','/register');
 await context.addCookies([{name:'yeyu_session',value:admin.token,url:base}]);
 await shot('03-workspace','/workspace');await shot('04-projects','/projects');
 const newButton=page.getByRole('button',{name:'新建项目',exact:true});if(await newButton.count()){await newButton.first().click();await shot('05-new-project');await page.keyboard.press('Escape');}
 await shot('06-history','/history');await shot('07-style-market','/styles');await shot('08-library','/library');
 for(const [name,url]of [['09-account','/settings/account'],['10-model','/settings/model'],['11-presentation','/settings/presentation'],['12-skills','/settings/skills'],['13-users','/settings/users'],['14-personalization','/settings/personalization']])await shot(name,url);
 await shot('15-hermes','/agents');await shot('16-stopped-task','/jobs/'+stoppedId);await shot('17-page-editor','/presentations/'+id+'/pages/2');await shot('18-online-slides','/slides/'+room.id);
 if(errors.length)throw Error('UI errors: '+errors.join('\n'));console.log('Captured manual screens without accessing production data or calling a model.');
}finally{
 await browser?.close();if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}
 process.chdir(root);const resolved=path.resolve(temporary);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('yeyu-manual-'))throw Error('Unexpected fixture path');await fs.rm(resolved,{recursive:true,force:true});
}
