import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {hermesRuntimePaths,inspectHermesRuntime,requireHermesRuntime,checkHermesBootstrap,HERMES_CORE_FILES} from '../server/hermes-runtime.mjs';
test('Hermes checks bootstrap and tool files, not just run_agent.py, before starting Python',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-runtime-check-'));try{
  const options={root,env:{HERMES_SOURCE_PATH:'source',HERMES_PYTHON:'python.exe'}};await fs.mkdir(path.join(root,'source'));await fs.writeFile(path.join(root,'source/run_agent.py'),'# fixture');await fs.writeFile(path.join(root,'python.exe'),'fixture');
  const incomplete=await inspectHermesRuntime(options);assert.equal(incomplete.available,false);assert.ok(incomplete.missingSourceFiles.includes('hermes_bootstrap.py'));await assert.rejects(requireHermesRuntime(options),e=>e.code==='HERMES_SOURCE_INCOMPLETE'&&e.message.includes('HERMES_SOURCE_PATH'));
  for(const name of HERMES_CORE_FILES){const file=path.join(root,'source',name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'# fixture');}assert.equal((await requireHermesRuntime(options)).available,true);assert.equal((await checkHermesBootstrap(options)).available,false);await fs.unlink(path.join(root,'python.exe'));await assert.rejects(requireHermesRuntime(options),e=>e.code==='HERMES_PYTHON_UNAVAILABLE');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Hermes resolves current settings at each call, including relative and blank configuration',()=>{
 const root=path.resolve('runtime-fixture'),env={HERMES_SOURCE_PATH:'one',HERMES_PYTHON:'python.exe'};assert.equal(hermesRuntimePaths({root,env}).sourcePath,path.join(root,'one'));env.HERMES_SOURCE_PATH='two';assert.equal(hermesRuntimePaths({root,env}).sourcePath,path.join(root,'two'));env.HERMES_SOURCE_PATH=' ';assert.equal(hermesRuntimePaths({root,env}).sourcePath,path.join(root,'data/hermes-agent'));
});
