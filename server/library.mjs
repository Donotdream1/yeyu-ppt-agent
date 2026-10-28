import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicUpdateJson} from './atomic-json.mjs';
import {createHash} from 'node:crypto';
import {openZip,slideOrder,slideInfo} from './ooxml.mjs';

export const dataDir=path.resolve('data');
const dbPath=path.join(dataDir,'library.json');
export const builtinAssets=[
  {id:'builtin-cover',title:'序章 · 主题封面',kind:'cover'},
  {id:'builtin-content',title:'正文 · 清晰叙述',kind:'content'},
  {id:'builtin-process',title:'计划 · 分步展开',kind:'process'},
  {id:'builtin-agenda',title:'目录 · 内容概览',kind:'agenda'},
  {id:'builtin-ending',title:'尾页 · 总结回顾',kind:'ending'},
].map(a=>({...a,builtin:true,sourceName:'拾页基础版式',editableShapes:4,charts:0,tables:0,images:0,text:a.title,tags:['简约','商务','通用'],placeholders:['{{title}}','{{body}}']}));
export async function init(){await fs.mkdir(path.join(dataDir,'sources'),{recursive:true});await fs.mkdir(path.join(dataDir,'outputs'),{recursive:true});await fs.mkdir(path.join(dataDir,'previews'),{recursive:true});}
export async function readLibrary(){try{return JSON.parse(await fs.readFile(dbPath,'utf8'));}catch(e){if(e.code==='ENOENT')return {assets:[],sources:[],prompts:[]};throw e;}}
let queue=Promise.resolve();
export async function update(change){const operation=queue.then(()=>atomicUpdateJson(dbPath,{assets:[],sources:[],prompts:[]},change));queue=operation.catch(()=>{});return operation;}
export async function importPptx(buffer,name){
  const id=createHash('sha256').update(buffer).digest('hex').slice(0,16);
  const prior=await readLibrary();if(prior.sources.some(s=>s.id===id&&s.indexVersion===3))return {id,duplicate:true,slides:prior.assets.filter(a=>a.sourceId===id).length};
  const zip=await openZip(buffer),order=await slideOrder(zip),assets=[];
  if(order.paths.length>1000)throw new Error('单个文件最多支持 1000 页');
  for(let i=0;i<order.paths.length;i++){
    const part=order.paths[i];if(!zip.file(part))throw new Error('找不到素材中的幻灯片');
    const info=slideInfo(await zip.file(part).async('string'));
    const heading=info.shapes.find(s=>s.y<1200000&&s.x<6000000&&s.w>2500000&&s.text.length>3);
    assets.push({id:`${id}-${i+1}`,sourceId:id,sourceName:name,part,page:i+1,title:(heading?.text||info.shapes.filter(s=>s.text.length>1).sort((a,b)=>b.font-a.font)[0]?.text)?.slice(0,55)||`第 ${i+1} 页`,...info,width:order.width,height:order.height,tags:[name.replace(/\.pptx$/i,''),info.kind],thumbnail:`/api/previews/${id}/${i+1}.png`});
  }
  await fs.writeFile(path.join(dataDir,'sources',id+'.pptx'),buffer);
  await update(db=>{db.sources=db.sources.filter(s=>s.id!==id);db.assets=db.assets.filter(a=>a.sourceId!==id);db.sources.push({id,name,indexVersion:3,slides:assets.length,importedAt:new Date().toISOString(),width:order.width,height:order.height});db.assets.push(...assets);});
  return {id,slides:assets.length,duplicate:false};
}
export const sourceBuffer=id=>{if(!/^[a-f0-9]{16}$/.test(id))throw new Error('无效素材 ID');return fs.readFile(path.join(dataDir,'sources',id+'.pptx'));};
export async function annotateAsset(id,metadata){
  let result;
  await update(db=>{const asset=db.assets.find(a=>a.id===id);if(!asset)throw new Error('素材不存在');const indices=[metadata.mapping.titleIndex,...metadata.mapping.bodyIndices,...(metadata.mapping.subtitleIndex>=0?[metadata.mapping.subtitleIndex]:[])];if(new Set(indices).size!==indices.length||indices.some(i=>i<0||i>=asset.shapes.length))throw new Error('文字槽重复或不存在');Object.assign(asset,metadata);result=asset;});
  return result;
}
export async function scanDirectory(root){
  const stat=await fs.stat(root).catch(()=>null);if(!stat?.isDirectory())throw new Error('素材文件夹不存在');
  const found=[],errors=[],prompts=[];
  async function walk(dir,depth=0){
    if(depth>8)return;
    for(const e of await fs.readdir(dir,{withFileTypes:true})){
      if(e.isSymbolicLink()||e.name.startsWith('~'+'$'))continue;
      const file=path.join(dir,e.name);
      if(e.isDirectory())await walk(file,depth+1);
      else if(/\.pptx$/i.test(e.name))found.push(file);
      else if(/\.(txt|md)$/i.test(e.name)&&/提示|prompt/i.test(file)){
        const stat=await fs.stat(file);
        if(stat.size<=150000){const text=await fs.readFile(file,'utf8');prompts.push({id:createHash('sha256').update(file).digest('hex').slice(0,16),name:e.name,text:text.slice(0,16000)});}
      }
    }
  }
  await walk(root);let imported=0,duplicates=0;
  for(const file of found){try{const s=await fs.stat(file);if(s.size>100*1024*1024)throw new Error('文件超过 100MB');const r=await importPptx(await fs.readFile(file),path.basename(file));r.duplicate?duplicates++:imported++;}catch(e){errors.push({file,error:e.message});}}
  if(prompts.length)await update(db=>{for(const p of prompts){const i=db.prompts.findIndex(v=>v.id===p.id);if(i<0)db.prompts.push(p);else db.prompts[i]=p;}});
  return {found:found.length,imported,duplicates,prompts:prompts.length,errors};
}
function terms(s){const str=String(s).toLowerCase();return [...new Set([...str.matchAll(/[a-z]{2,}|[\u4e00-\u9fff]{2}/g)].map(m=>m[0]))];}
export function matchAsset(slide,assets,used=new Set()){
  const query=terms([slide.title,...slide.bullets,slide.kind].join(' '));
  const bodySlots=a=>(a.shapes||[]).filter(s=>s.y>1200000&&s.w>2000000&&s.h>600000&&s.font<=24&&s.text.length>=20).length;
  const scores=assets.filter(a=>{
    if(a.builtin)return true;
    if(a.charts||a.tables||a.images>3||Math.abs(a.width/a.height-16/9)>=.06||/欢迎加我|如在使用|终于等到/.test(a.text))return false;
    if(a.approved&&a.mapping)return a.kind===slide.kind&&a.mapping.bodyIndices.length>=slide.bullets.length;
    if(['cover','ending','agenda'].includes(slide.kind))return a.kind===slide.kind&&(!slide.bullets.length||bodySlots(a)>0);
    const slots=bodySlots(a),labels=a.shapes.filter(s=>s.text.trim()).length;
    return a.kind===slide.kind&&slide.bullets.length>=2&&slots===slide.bullets.length&&labels<=slots*2+4;
  }).map(a=>{
    let score=a.kind===slide.kind?14:0;
    if(!a.builtin)score+=9;
    if(a.approved&&a.mapping)score+=30;
    if(used.has(a.id))score-=8;
    const text=[a.text,...(a.tags||[])].join(' ').toLowerCase();
    score+=Math.min(5,query.filter(t=>text.includes(t)).length)*2;
    if(!a.builtin&&!['cover','ending','agenda'].includes(slide.kind))score-=Math.abs(bodySlots(a)-slide.bullets.length)*4;
    if(a.kind==='cover'&&slide.kind!=='cover')score-=14;
    if(a.kind==='ending'&&slide.kind!=='ending')score-=16;
    if(a.editableShapes<2)score-=20;
    return {asset:a,score};
  }).sort((a,b)=>b.score-a.score);
  return scores[0]?.asset||builtinAssets.find(a=>a.kind===slide.kind)||builtinAssets[1];
}
