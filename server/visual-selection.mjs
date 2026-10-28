import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {selectPreparedMaterial} from './material-preflight.mjs';
import {componentPreview} from './components.mjs';
import {dataDir} from './library.mjs';
import {queuePowerPoint} from './render.mjs';
import {runHermes} from './hermes-client.mjs';
import {mapPageBatches} from './workflow-checkpoints.mjs';
import {contentUnits} from './designer.mjs';
import {SHARED_CONTRACT,VISUAL_CONTRACT,compactVisualFeatures} from './workflow-prompts.mjs';
import {compactPageTags,parseMaterialQuery} from './material-tags.mjs';

const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const shortName=s=>String(s||'').replace(/\.pptx$/i,'').slice(0,25);
export function intendedModuleCount(slide){
 const declared=slide.materialRequest?.moduleCount,valid=Number.isInteger(declared)&&declared>0&&declared<=50;
 if(valid&&slide.materialRequest.moduleCountExplicit!==false)return declared;
 const title=String(slide.title||'').replace(/([一二两三四五六七八九十\d]+)(?:大|类|组|环节|方面)/g,'$1项'),count=parseMaterialQuery(title).moduleCount;
 return count|| (valid?declared:null);
}
export function bodyColumnCount(c){const xs=(c.slots||[]).filter(s=>s.role==='body'&&s.position&&s.position.y>.18&&s.position.y<.75&&s.position.w>.06&&s.position.w<.28&&s.position.h>.09).map(s=>s.position.x).sort((a,b)=>a-b),columns=[];for(const x of xs)if(!columns.some(v=>Math.abs(v-x)<.06))columns.push(x);return columns.length;}
export const VISUAL_SELECTION_TOOL={name:'ppt_commit_visual_choices',description:'Choose the best actual candidate composition for each assigned page after comparing the numbered contact-sheet images. Only candidate IDs from that page are allowed. Give concrete visual reasons and a copy plan preserving native source font sizes.',parameters:{type:'object',properties:{pages:{type:'array',items:{type:'object',properties:{page:{type:'integer'},materialId:{type:'string'},reason:{type:'string'},copyGuidance:{type:'string'},readingOrder:{type:'string'}},required:['page','materialId','reason','copyGuidance']}}},required:['pages']}};

export function visualGeometry(c){
 const slots=(c.slots||[]).filter(s=>!s.decorative),x=slots.map(s=>s.position?.x).filter(Number.isFinite).sort((a,b)=>a-b),columns=[];
 for(const v of x)if(!columns.some(n=>Math.abs(n-v)<.06))columns.push(v);
 return {relation:c.relation,sourceAspect:+(c.bounds.w/c.bounds.h).toFixed(2),textColumns:columns.length,slots:slots.length,groups:c.structure?.groups||0,arrows:c.structure?.arrows||[],connectors:c.structure?.connectors?.length||0,roleCounts:slots.reduce((v,s)=>(v[s.role]=(v[s.role]||0)+1,v),{}),sourceFontSizes:[...new Set(slots.map(s=>s.font).filter(Number.isFinite))].sort((a,b)=>a-b),slotPositions:slots.map(s=>({slot:s.index,role:s.role,group:s.groupKey,position:s.position,fontPt:s.font,maxChars:s.maxChars,fixed:s.fixed}))};
}
export async function imageVisualFeatures(buffer){
 const {data,info}=await sharp(buffer).flatten({background:'#FFFFFF'}).resize(96,54,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});let white=0,minX=info.width,minY=info.height,maxX=-1,maxY=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*info.channels;if(data[i]>242&&data[i+1]>242&&data[i+2]>242)white++;else{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
 return {whiteSpaceRatio:+(white/(info.width*info.height)).toFixed(3),inkBounds:maxX<0?null:{x:+(minX/info.width).toFixed(3),y:+(minY/info.height).toFixed(3),w:+((maxX-minX+1)/info.width).toFixed(3),h:+((maxY-minY+1)/info.height).toFixed(3)}};
}
export async function ensureVisualPreviews(components){
 const missing=new Map();for(const c of components){try{await fs.access(path.join(dataDir,'previews',c.sourceId,c.page+'.png'));}catch{if(!missing.has(c.sourceId))missing.set(c.sourceId,new Set());missing.get(c.sourceId).add(c.page);}}
 const errors=[];
 for(const [sourceId,pages]of missing){
  if(process.platform!=='win32'){errors.push({sourceId,reason:'当前环境无法渲染素材预览'});continue;}
  if(!/^[a-f0-9]{16}$/.test(sourceId)){errors.push({sourceId,reason:'素材源编号无效'});continue;}
  try{await queuePowerPoint(()=>new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/render-selected-pages.ps1'),'-InputFile',path.join(dataDir,'sources',sourceId+'.pptx'),'-OutputDir',path.join(dataDir,'previews',sourceId),'-SlidePages',[...pages].join(',')],{windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',s=>error+=s);const timer=setTimeout(()=>{child.kill();reject(Error('素材预览生成超时'));},180000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('素材预览不可用'));});}));}catch(e){errors.push({sourceId,reason:e.message});}
 }
 return errors;
}
export async function prepareVisualCandidates(slide,components,{template,preferredSourceId,referenceId,used=new Set(),limit=4,select=selectPreparedMaterial,excludeIds=[]}={}){
 const selected=[],excluded=[...excludeIds],sameFamily=preferredSourceId?components.filter(c=>c.sourceId===preferredSourceId):components;
 // An outline's coarse label is a suggestion. Categorical facts can also use
 // parallel/compare compositions; never turn a real cycle/timeline into cards.
 const count=intendedModuleCount(slide),categorical=['matrix','responsibility','compare'].includes(slide.visual)||(slide.visual==='process'&&/模型|职责|分工|角色|要素/.test(slide.title)),alternate=categorical?{...slide,visual:'parallel'}:null,topology=count?sameFamily.filter(c=>bodyColumnCount(c)===count):[];
 const pools=[...(topology.length?[{slide:{...slide,visual:'parallel'},items:topology,quota:2}]:[]),{slide,items:sameFamily,quota:alternate?2:limit},...(alternate?[{slide:alternate,items:sameFamily}]:[]),...(sameFamily!==components?[{slide,items:components},...(alternate?[{slide:alternate,items:components}]:[])]:[])];
 for(const pool of pools){
  let added=0;while(selected.length<limit&&added<(pool.quota||limit)){const result=await select(pool.slide,pool.items,{template,referenceId,used:new Set(used),excludeIds:excluded});if(!result.component)break;selected.push({...result,features:{...visualGeometry(result.component),requestedRelation:slide.visual,intendedModuleCount:count,bodyColumns:bodyColumnCount(result.component),alternativeCategoricalLayout:pool.slide!==slide}});excluded.push(result.component.id);added++;}
  if(selected.length>=limit)break;
 }
 return selected;
}
export async function createVisualContactSheet(pages,folder,{preview=componentPreview}={}){
 await fs.mkdir(folder,{recursive:true});const tileW=480,tileH=320,cols=Math.max(1,...pages.map(p=>p.candidates.length)),layers=[];
 for(const [row,p]of pages.entries())for(const [col,c]of p.candidates.entries()){
  let image;try{const b=await preview(c.component);c.imageFeatures=await imageVisualFeatures(b);image=await sharp(b).resize(tileW-20,tileH-54,{fit:'contain',background:'#FFFFFF'}).png().toBuffer();c.previewAvailable=true;}catch{c.previewAvailable=false;image=await sharp({create:{width:tileW-20,height:tileH-54,channels:3,background:'#F1F3F7'}}).png().toBuffer();}
  const label=`P${p.page} C${col+1} | ${shortName(c.component.sourceName)} p${c.component.page}`,svg=Buffer.from(`<svg width="${tileW}" height="44"><rect width="100%" height="100%" fill="#EDF2FC"/><text x="10" y="27" font-family="Microsoft YaHei,Arial" font-size="15" fill="#164C78">${escape(label)}</text></svg>`);
  layers.push({input:svg,left:col*tileW,top:row*tileH},{input:image,left:col*tileW+10,top:row*tileH+48});
 }
 const file=path.join(folder,'contact.png');await sharp({create:{width:tileW*cols,height:tileH*Math.max(1,pages.length),channels:3,background:'#FFFFFF'}}).composite(layers).png().toFile(file);return file;
}
export function validateVisualChoices(items,pages){
 const accepted=[],errors=[],seen=new Set();for(const item of items||[]){const n=Number(item.page),p=pages.find(p=>p.page===n);if(!p||seen.has(n)){errors.push({page:n,issue:'页面未分配或重复提交'});continue;}seen.add(n);if(!p.candidates.some(c=>c.component.id===item.materialId)){errors.push({page:n,issue:'素材不在该页候选中'});continue;}if(!String(item.reason||'').trim()||!String(item.copyGuidance||'').trim()){errors.push({page:n,issue:'缺少具体视觉理由或文字安排'});continue;}accepted.push({...item,page:n,reason:String(item.reason).slice(0,1500),copyGuidance:String(item.copyGuidance).slice(0,2500)});}
 return {accepted,errors};
}
export async function selectVisualPages(pages,{apiKey,model,checkpointId,requirements='',designLock,runAgent=runHermes,onPhase=()=>{},onMetrics=()=>{},onSelection=()=>{},concurrency=2,batchSize=4,ensurePreviews=ensureVisualPreviews,createContactSheet=createVisualContactSheet}={}){
 if(!pages.length)return {choices:new Map(),failures:[]};
 await ensurePreviews(pages.flatMap(p=>p.candidates.map(c=>c.component)));
 const choices=new Map();
 const result=await mapPageBatches(pages.map(p=>p.page),{concurrency:Math.min(2,concurrency),batchSize:Math.max(1,Math.min(4,batchSize)),worker:async numbers=>{
  const batch=pages.filter(p=>numbers.includes(p.page)),batchId=randomUUID(),folder=path.join(dataDir,'visual-selections',checkpointId,batchId),sheet=await createContactSheet(batch,folder),allImages=batch.every(p=>p.candidates.every(c=>c.previewAvailable)),accepted=new Map();let vision=null;
  const payload={requirements,designLock,pages:batch.map(p=>({page:p.page,title:p.slide.title,units:contentUnits(p.slide),visual:p.slide.visual,materialRequest:p.slide.materialRequest,candidates:p.candidates.map((c,i)=>({label:`P${p.page} C${i+1}`,materialId:c.component.id,sourceName:c.component.sourceName,sourcePage:c.component.page,features:compactVisualFeatures(c.features),tags:compactPageTags(c.component.pageTags),matchReasons:c.tagMatch?.reasons,imageFeatures:c.imageFeatures,usage:c.layout.layoutReview?.materialUsage}))})),imageLegend:'Each row is one output page. Each column is a candidate. Pn Ck labels map to candidates above. Existing example words in images are design examples, never user facts. Automatic tags are estimates to be checked against the actual image.'};
  onPhase(`视觉选版智能体：比较第 ${numbers.join('、')} 页的候选构图`);
  const selectionTool=structuredClone(VISUAL_SELECTION_TOOL),fields=selectionTool.parameters.properties.pages.items.properties;fields.page.enum=numbers;fields.materialId.enum=[...new Set(batch.flatMap(p=>p.candidates.map(c=>c.component.id)))];
  const response=await runAgent({id:randomUUID(),apiKey,model,role:'visual-selector',allowSkillTool:false,maxIterations:4,maxTokens:6000,timeoutMs:240000,images:allImages?[sheet]:[],onVision:v=>{vision=v;},systemPrompt:SHARED_CONTRACT+'\n'+VISUAL_CONTRACT,message:JSON.stringify(payload),tools:[selectionTool],onTool:async(name,args)=>{if(name!==VISUAL_SELECTION_TOOL.name)throw Error('视觉角色只能提交选版结果');const checked=validateVisualChoices(args.pages,batch);for(const v of checked.accepted)accepted.set(v.page,v);return {ok:!checked.errors.length,pages:checked.accepted.map(v=>({page:v.page,ok:true})),errors:checked.errors,remaining:numbers.filter(n=>!accepted.has(n))};},completeWhen:(_,r,state)=>{
   // Older agent adapters provide only (tool, result). The vision event is
   // independently observed; missing callback state must not fail a whole batch.
   if(state?.vision!==undefined)vision=state.vision;
   return Boolean(r?.ok&&numbers.every(n=>accepted.has(n))&&(!allImages||vision!=null));
  },onMetrics});
  vision=vision||response?.vision||response?.metrics?.vision;const sawImages=allImages&&vision?.nativeVision===true;
  for(const p of batch){const choice=accepted.get(p.page);if(!choice)throw Error(`第 ${p.page} 页尚未提交视觉选版结果`);const selected=p.candidates.find(c=>c.component.id===choice.materialId),url=`/api/visual-selections/${checkpointId}/${batchId}/contact.png`,meta={mode:sawImages?'image-understanding':'geometry-only',model,selectedMaterialId:choice.materialId,sourceName:selected.component.sourceName,sourcePage:selected.component.page,reason:choice.reason,copyGuidance:choice.copyGuidance,readingOrder:choice.readingOrder||'',fontPolicy:{family:'微软雅黑',size:'source-preferred',autoShrink:false,explicitStyle:true},contactSheetUrl:url,visionEvidence:vision||{nativeVision:false,reason:allImages?'模型未确认接受图片':'部分素材预览不可用'},candidates:p.candidates.map(c=>({materialId:c.component.id,sourceName:c.component.sourceName,sourcePage:c.component.page,thumbnail:c.component.thumbnail,selected:c===selected,reason:c===selected?choice.reason:'参与本页构图比较的候选',features:c.features,usage:c.layout.layoutReview?.materialUsage}))};choices.set(p.page,{...selected,metadata:meta});await onSelection(p.page,choices.get(p.page));}
  return {pages:numbers};
 }});
 return {choices,failures:result.failures};
}
