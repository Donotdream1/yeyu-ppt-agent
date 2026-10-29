import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectHermesRuntime} from '../server/hermes-runtime.mjs';
const exists=p=>fs.access(p).then(()=>true,()=>false);
const runtime=await inspectHermesRuntime();
const checks=[['Node.js >=22.12',Number(process.versions.node.split('.')[0])>=22],['Frontend dependencies',await exists('node_modules/react/package.json')],['Built frontend',await exists('dist/index.html')],['Hermes source (bootstrap, agent and tools)',!runtime.missingSourceFiles.length],['Hermes Python environment',runtime.pythonExists],['Base PPTX',await exists('server/base.pptx')]];
if(process.platform==='win32'){
 const office=spawnSync('powershell.exe',['-NoProfile','-Command',String.raw`[bool](Get-Item 'Registry::HKEY_CLASSES_ROOT\PowerPoint.Application' -ErrorAction SilentlyContinue)`],{encoding:'utf8',windowsHide:true});checks.push(['Microsoft PowerPoint (native preview)',office.stdout?.trim()==='True']);
}else checks.push(['Windows / Office preview support',false]);
for(const [name,ok]of checks)console.log(`${ok?'OK':'MISSING'} ${name}`);
if(runtime.missingSourceFiles.length)console.log('Missing Hermes source files: '+runtime.missingSourceFiles.join(', ')+'. Check HERMES_SOURCE_PATH.');
console.log('Data remains local in data/. Configure private model connections in Settings > Models.');
if(checks.some(([,ok])=>!ok))process.exitCode=1;
