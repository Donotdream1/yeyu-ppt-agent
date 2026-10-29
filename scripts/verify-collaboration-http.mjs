// Real HTTP/UI protocol checks with synthetic accounts and previews only.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-collaboration-http-'));
let child,browser;const errors=[];
try{
 process.chdir(directory);process.env.NODE_ENV='test';process.env.AUTH_DATA_DIR=path.join(directory,'auth');process.env.PROJECTS_ROOT=path.join(directory,'projects');delete process.env.AUTH_TEST_MODE;delete process.env.DEEPSEEK_API_KEY;
 await fs.mkdir('server');await fs.copyFile(path.join(root,'server/base.pptx'),'server/base.pptx');await fs.cp(path.join(root,'agents'),'agents',{recursive:true,filter:src=>!src.includes('vendor-skills')});
 await fs.cp(path.join(root,'dist'),'dist',{recursive:true});
 const {init,dataDir}=await import('../server/library.mjs');await init();const {localAuth}=await import('../server/local-auth.mjs');
 await localAuth.register({username:'fixture-admin',password:'test-password-123'});
 const users={};for(const username of ['author','viewer','editor','outsider'])users[username]=await localAuth.register({username:'fixture-'+username,password:'test-password-123'});
 const outputId=randomUUID(),info={id:outputId,title:'协作协议测试',pages:2,createdAt:new Date().toISOString(),url:'/api/files/'+outputId+'.pptx',plan:{title:'协作协议测试',sourceText:'PRIVATE_SOURCE_DOCUMENT',slides:[{title:'准备资料',kind:'cover',bullets:[],notes:'PRIVATE_SPEAKER_NOTES'},{title:'协同执行',kind:'content',bullets:[]}]}};
 await fs.mkdir(path.join(dataDir,'outputs'),{recursive:true});await fs.writeFile(path.join(dataDir,'outputs',outputId+'.json'),JSON.stringify(info));await fs.copyFile(path.join(root,'server/base.pptx'),path.join(dataDir,'outputs',outputId+'.pptx'));await localAuth.claim('outputs',outputId,users.author.user.id);
 const previews=path.join(dataDir,'previews',outputId);await fs.mkdir(previews,{recursive:true});for(let page=1;page<=2;page++)await sharp(Buffer.from(`<svg width="1280" height="720"><rect width="1280" height="720" fill="white"/><text x="120" y="180" font-size="60" fill="#164C78">SYNTHETIC SLIDE ${page}</text></svg>`)).png().toFile(path.join(previews,page+'.png'));
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
 child=spawn(process.execPath,[path.join(root,'server/index.mjs'),'--production'],{cwd:directory,env:{...process.env,PORT:String(port),BIND_ADDRESS:'127.0.0.1'},windowsHide:true,stdio:['ignore','pipe','pipe']});child.stderr.on('data',d=>errors.push(String(d)));child.stdout.on('data',()=>{});
 for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error('Test server stopped: '+errors.join(''));try{if((await fetch(base+'/api/network')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const cookie=u=>'yeyu_session='+users[u].token,call=async(user,url,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:cookie(user)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
 const created=await call('author','/api/collaboration/rooms',{outputId});assert.equal(created.status,201);const roomId=created.body.id,roomUrl='/api/collaboration/rooms/'+roomId;
 assert.equal((await call(null,roomUrl)).status,401);assert.equal((await call('outsider',roomUrl)).status,403);
 assert.equal((await call('author',roomUrl+'/members',{username:'fixture-viewer',role:'viewer'})).status,200);assert.equal((await call('author',roomUrl+'/members',{username:'fixture-editor',role:'editor'})).status,200);
 const viewer=await call('viewer',roomUrl);assert.equal(viewer.status,200);assert.ok(!JSON.stringify(viewer.body).includes('PRIVATE_'));assert.equal(viewer.body.editPath,undefined);
 assert.equal((await call('viewer','/api/outputs/'+outputId)).status,403);assert.equal((await call('viewer','/api/page-sessions?outputId='+outputId+'&page=0')).status,403);
 assert.equal((await call('editor','/api/outputs/'+outputId)).status,200);assert.equal((await call('editor','/api/outputs/'+outputId,undefined,'DELETE')).status,403);assert.equal((await call('editor','/api/outputs/batch-delete',{ids:[outputId]})).status,403);assert.equal((await call('editor','/api/slides-connectors/export',{outputId,provider:'google',token:'test-token'})).status,403);
 assert.equal((await fetch(base+viewer.body.slides[0].preview,{headers:{Cookie:cookie('viewer')}})).status,200);
 assert.equal((await call('viewer',roomUrl+'/comments',{page:0,text:'请补充说明'})).status,200);assert.equal((await call('viewer',roomUrl+'/presentation',{action:'start'})).status,403);
 const {chromium}=await import('playwright');browser=await chromium.launch({headless:true});const contexts={};
 for(const user of ['author','viewer']){const context=await browser.newContext({viewport:{width:1440,height:960}});await context.addCookies([{name:'yeyu_session',value:users[user].token,url:base}]);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/slides/'+roomId);await page.getByRole('heading',{name:'协作协议测试'}).waitFor();contexts[user]={context,page};}
 await contexts.author.page.getByRole('button',{name:'开始同步演示'}).click();await contexts.viewer.page.getByRole('button',{name:'跟随演示中'}).waitFor();await contexts.author.page.getByRole('button',{name:'下一页',exact:true}).click();await contexts.viewer.page.getByAltText('第2页 协同执行').waitFor();
 assert.equal(await contexts.viewer.page.getByRole('button',{name:'开始同步演示'}).count(),0);await contexts.viewer.page.getByRole('button',{name:'评论',exact:true}).click();await contexts.viewer.page.getByLabel('页面评论').fill('在线批注测试');await contexts.viewer.page.getByRole('button',{name:'发送评论'}).click();await contexts.viewer.page.getByText('在线批注测试',{exact:true}).waitFor();
 await contexts.author.page.screenshot({path:path.join(root,'test-output/collaboration-presenter.png')});await contexts.viewer.page.screenshot({path:path.join(root,'test-output/collaboration-viewer.png')});
 await call('author',roomUrl+'/members/'+users.viewer.user.id,undefined,'DELETE');await contexts.viewer.page.getByText('协作权限已撤回，请联系作品拥有者').waitFor();
 await contexts.author.page.goto(base+'/workspace');await contexts.author.page.getByLabel('文档内容',{exact:true}).fill('用于核对输入模式切换的原始长文档，保留用户已经写好的内容。');await contexts.author.page.getByRole('tab',{name:'主题初稿',exact:true}).click();await contexts.author.page.getByLabel('演示主题',{exact:true}).fill('数字化转型');await contexts.author.page.getByRole('tab',{name:'文档生成',exact:true}).click();assert.match(await contexts.author.page.getByLabel('文档内容',{exact:true}).inputValue(),/原始长文档/);await contexts.author.page.getByRole('tab',{name:'主题初稿',exact:true}).click();assert.equal(await contexts.author.page.getByLabel('演示主题',{exact:true}).inputValue(),'数字化转型');
 const persisted=JSON.parse(await fs.readFile(path.join(directory,'auth/accounts.json'),'utf8'));assert.equal(persisted.owners.roots[outputId],users.author.user.id);assert.equal(persisted.owners.outputs[outputId],users.author.user.id);
 assert.deepEqual(errors,[]);console.log('PASS authenticated HTTP ACL, source privacy, editor access without deletion, real SSE follow, browser comments, permission revocation and unchanged ownership');
}finally{await browser?.close();if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}process.chdir(root);await fs.rm(directory,{recursive:true,force:true});}
