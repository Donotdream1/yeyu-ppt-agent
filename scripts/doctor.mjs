import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {HERMES_PYTHON,HERMES_SOURCE} from '../server/hermes-client.mjs';
const exists=p=>fs.access(p).then(()=>true,()=>false);
const checks=[['Node.js >=22.12',Number(process.versions.node.split('.')[0])>=22],['Frontend dependencies',await exists('node_modules/react/package.json')],['Built frontend',await exists('dist/index.html')],['Hermes source',await exists(path.join(HERMES_SOURCE,'run_agent.py'))],['Hermes Python environment',await exists(HERMES_PYTHON)],['Base PPTX',await exists('server/base.pptx')]];
if(process.platform==='win32'){
 const office=spawnSync('powershell.exe',['-NoProfile','-Command',"[bool](Get-Item 'Registry::HKEY_CLASSES_ROOT\PowerPoint.Application' -ErrorAction SilentlyContinue)"],{encoding:'utf8',windowsHide:true});checks.push(['Microsoft PowerPoint (native preview)',office.stdout?.trim()==='True']);
}else checks.push(['Windows / Office preview support',false]);
for(const [name,ok]of checks)console.log(`${ok?'OK':'MISSING'} ${name}`);
console.log('Data remains local in data/. Configure private model connections in Settings > Models.');
if(checks.some(([,ok])=>!ok))process.exitCode=1;
