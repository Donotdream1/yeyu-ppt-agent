import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-unit-'));
let code=1;
try{
 // All persistent test stores resolve from this isolated working directory.
 process.chdir(directory);process.env.NODE_ENV='test';process.env.PROJECTS_ROOT=path.join(directory,'projects');delete process.env.DEEPSEEK_API_KEY;delete process.env.AUTH_TEST_MODE;
 await fs.mkdir('server');await fs.copyFile(path.join(root,'server/base.pptx'),'server/base.pptx');await fs.cp(path.join(root,'agents/skills'),'agents/skills',{recursive:true});await fs.cp(path.join(root,'agents/vendor'),'agents/vendor',{recursive:true});
 const {prepareTestFixtures}=await import('./test-fixtures.mjs');await prepareTestFixtures();
 const tests=(await fs.readdir(path.join(root,'test'))).filter(f=>f.endsWith('.test.mjs')).map(f=>path.join(root,'test',f));
 code=await new Promise(resolve=>{const child=spawn(process.execPath,['--test',...tests],{cwd:directory,env:process.env,stdio:'inherit',windowsHide:true});child.on('error',e=>{console.error(e.message);resolve(1);});child.on('exit',v=>resolve(v??1));});
}finally{process.chdir(root);await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});}
process.exitCode=code;
