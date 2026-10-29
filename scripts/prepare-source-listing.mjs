// Extract a reproducible first-party program listing, without reading runtime data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as prettier from 'prettier';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.resolve(process.argv[2]||path.join(root,'test-output/copyright-docs'));
const sha=value=>createHash('sha256').update(value).digest('hex'),version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean),entry=['src/bootstrap.jsx','src/App.jsx','src/components/AuthGate.jsx','src/hooks/use-studio.jsx'];
const tail=['agents/hermes_worker.py','scripts/render.ps1','scripts/render-selected-pages.ps1','scripts/fit-native-text.ps1'];
const eligible=p=>(p.startsWith('src/')&&/\.(?:jsx?|css)$/.test(p)&&!p.startsWith('src/components/ui/'))||(p.startsWith('server/')&&p.endsWith('.mjs'));
const reachable=new Set(),queue=['src/bootstrap.jsx','server/index.mjs'];
while(queue.length){const file=queue.shift();if(reachable.has(file))continue;reachable.add(file);const source=await fs.readFile(path.join(root,file),'utf8');
 const specs=[...source.matchAll(/(?:\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?|\bimport\s*\()\s*['"]([^'"]+)['"]/g),...source.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map(m=>m[1]);
 for(const spec of specs){if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;const base=(spec.startsWith('@/')?path.posix.join('src',spec.slice(2)):path.posix.normalize(path.posix.join(path.posix.dirname(file),spec))),resolved=[base,...['.js','.jsx','.mjs','.css','/index.js','/index.jsx'].map(e=>base+e)].find(p=>tracked.includes(p));if(resolved&&!reachable.has(resolved)&&/\.(?:jsx?|mjs|css)$/.test(resolved))queue.push(resolved);}
}
const remaining=tracked.filter(p=>eligible(p)&&reachable.has(p)&&!entry.includes(p)),ordered=[...remaining.filter(p=>p.startsWith('src/')).sort(),...remaining.filter(p=>p.startsWith('server/')).sort()];
const files=[...entry.filter(p=>reachable.has(p)),...ordered,...tail.filter(p=>tracked.includes(p))],records=[],display=[],originals=[];
const dirty=execFileSync('git',['diff','HEAD','--name-only','--',...files],{cwd:root,encoding:'utf8'}).trim();if(dirty)throw Error('Commit first-party program changes before generating a traceable listing: '+dirty);
const width=s=>[...s].reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0);
function fragments(line){let current='',units=0,result=[];for(const c of line.replace(/\t/g,'    ')){const step=width(c);if(units+step>86&&current){result.push(current);current='';units=0;}current+=c;units+=step;}if(current)result.push(current);return result;}
for(const file of files){
 const source=await fs.readFile(path.join(root,file),'utf8');
 if(/\bsk-[A-Za-z0-9_-]{16,}\b/.test(source))throw Error('Possible credential in '+file);
 let formatted=source;if(/\.(?:jsx?|mjs|css)$/.test(file))formatted=await prettier.format(source,{filepath:file,printWidth:82,tabWidth:2,useTabs:false});
 const start=display.length+1;
 for(const [i,line]of formatted.replace(/\r\n/g,'\n').split('\n').entries()){
  if(!line.trim())continue;originals.push({file,line:i+1,text:line});const chunks=fragments(line);for(const [segment,text]of chunks.entries())display.push({file,line:i+1,segment:segment+1,segments:chunks.length,text});
 }
 records.push({file,sha256:sha(source),formattedSha256:sha(formatted),sourceLines:source.split(/\r?\n/).length,formattedLines:formatted.split('\n').length,displayRange:[start,display.length]});
}
if(display.length<3000)throw Error('Fewer than 3000 display lines; deposit the entire program instead');
const selected=[...display.slice(0,1500).map((r,i)=>({...r,canonical:i+1})),...display.slice(-1500).map((r,i)=>({...r,canonical:display.length-1499+i}))],pages=Array.from({length:60},(_,i)=>({page:i+1,records:selected.slice(i*50,(i+1)*50)}));
const manifest={softwareName:'页语智能演示文稿生成与协作系统',version:'V'+version,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),entryPoints:['src/bootstrap.jsx','server/index.mjs'],fileOrder:'active entry files, remaining sorted reachable first-party frontend modules and styles, sorted backend services, then declared Hermes and Office adapter files',excluded:['node_modules','agents/vendor','data','src/components/ui','unreachable legacy prototypes','test','user materials','credentials'],formatting:'Prettier display normalization for JS/JSX/CSS; no business statements added; blank lines excluded; long lines are display-wrapped, original files remain the executable authority',totalFiles:files.length,totalNonEmptyLogicalLines:originals.length,totalDisplayLines:display.length,selectedRanges:[[1,1500],[display.length-1499,display.length]],pages:pages.map(p=>({page:p.page,lines:p.records.length,first:p.records[0].canonical,last:p.records.at(-1).canonical,files:[...new Set(p.records.map(r=>r.file))]})),files:records};
await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'source-listing.json'),JSON.stringify({manifest,pages},null,2));await fs.writeFile(path.join(out,'source-manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({files:files.length,totalLines:display.length,pages:pages.length,linesPerPage:50,commit:manifest.sourceCommit}));
