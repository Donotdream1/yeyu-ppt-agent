import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {dataDir} from './library.mjs';
import {readComponents} from './components.mjs';
import {loadWorkflowCheckpoint} from './workflow-checkpoints.mjs';
import {autoCompose,composeDeck} from './composition.mjs';
import {applyDesignProfile} from './design-profile.mjs';
import {chartForDeck} from './charts.mjs';
import {renderPowerPoint,renderStates} from './render.mjs';

const tasks=new Map(),flights=new Map();
export function previewablePages(snapshot){
 const done=new Set(snapshot?.progress?.completedPages||[]),bad=new Set((snapshot?.pageErrors||[]).map(([n])=>+n));
 return (snapshot?.plan?.slides||[]).flatMap((s,i)=>done.has(i+1)||s.materialSnapshot&&s.materialBindings?.length?[{page:i+1,title:s.title,needsReview:bad.has(i+1)}]:[]);
}
export function previewFingerprint(snapshot,template,pages){
 const slides=snapshot.plan.slides.map((s,i)=>{if(!pages.some(p=>p.page===i+1))return null;const {contentReview,adaptation,materialAnalysis,visualSelection,manualDesign,notes,...appearance}=s;return appearance;});
 return createHash('sha256').update(JSON.stringify({version:'2026-10-27.1',template,plan:{...snapshot.plan,sourceText:undefined,slides}})).digest('hex').slice(0,32);
}
export async function getWorkflowPreviews(id,{start=false}={}){
 const snapshot=await loadWorkflowCheckpoint(id);if(!snapshot?.plan)throw Error('尚未生成逐页方案');
 if(snapshot.status==='done'&&snapshot.output?.id)return {status:'ready',final:true,pages:snapshot.plan.slides.map((s,i)=>({page:i+1,title:s.title,url:`/api/previews/${snapshot.output.id}/${i+1}.png`}))};
 if(!start)return tasks.get(id)||{status:'idle',pages:[],available:previewablePages(snapshot).length};
 const pages=previewablePages(snapshot);if(!pages.length)return {status:'waiting',pages:[],message:'页面填写完成后即可查看实际效果'};
 const {resolveTemplate}=await import('./studio.mjs'),base=await resolveTemplate(snapshot.plan.templateId),{template}=await applyDesignProfile(snapshot.plan,base);
 const key='workflow-'+previewFingerprint(snapshot,template,pages),folder=path.join(dataDir,'previews',key),manifest=path.join(folder,'preview.json');
 const describe=(status,extra={})=>({status,key,pages:pages.map(p=>({...p,url:`/api/previews/${key}/${p.page}.png`})),...extra});
 try{const saved=JSON.parse(await fs.readFile(manifest,'utf8')),fresh={...saved,pages:describe('ready').pages};tasks.set(id,fresh);return fresh;}catch{}
 if(flights.has(key)){const value=describe('rendering');tasks.set(id,value);return value;}
 const value=describe('rendering');tasks.set(id,value);
 const job=(async()=>{
  try{
   const catalog=await readComponents(),ready=new Set(pages.map(p=>p.page));
   // Keep original page indices so cover, footers and section navigation agree
   // with the final deck. Unfilled scaffolding pages are never shown in the UI.
   const slides=snapshot.plan.slides.map((s,i)=>ready.has(i+1)?autoCompose({...snapshot.plan,slides:[s]},template,catalog.items).slides[0]:{...s,materialSnapshot:undefined,materialBindings:undefined,blocks:[{id:'pending',type:'text',role:'title',text:'页面制作中',x:.05,y:.2,w:.9,h:.1,fontSize:24}]});
   const out=await composeDeck({...snapshot.plan,slides},template,catalog.items,{chartRenderer:chartForDeck});
   await fs.mkdir(folder,{recursive:true});const input=path.join(folder,'stage-preview.pptx');await fs.writeFile(input,out.buffer);
   await renderPowerPoint(input,folder,key);if(renderStates.get(key)?.status!=='ready')throw Error(renderStates.get(key)?.message||'实际页面预览尚未完成');
   const result=describe('ready');await fs.writeFile(manifest,JSON.stringify(result));for(const [task,value]of tasks)if(value.key===key)tasks.set(task,result);
  }catch(e){for(const [task,value]of tasks)if(value.key===key)tasks.set(task,describe('failed',{message:e.message}));}
  finally{flights.delete(key);}
 })();flights.set(key,job);return value;
}
