import {workspaceLibrary} from './workspace-library.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import JSZip from 'jszip';
import {dataDir} from './library.mjs';
import {openZip,slideOrder} from './ooxml.mjs';
import {fitNativeText} from './native-text-fit.mjs';
import {renderPowerPoint,renderStates} from './render.mjs';
import {mergeNativeEdits} from './native-page-editor.mjs';

export async function assertOtherSlidesUnchanged(before,after,page){
 const [a,b]=await Promise.all([openZip(before),openZip(after)]),[ao,bo]=await Promise.all([slideOrder(a),slideOrder(b)]);if(ao.paths.length!==bo.paths.length)throw Error('单页修改不能改变整稿页数');
 for(let i=0;i<ao.paths.length;i++)if(i!==page&&await a.file(ao.paths[i]).async('string')!==await b.file(bo.paths[i]).async('string'))throw Error(`第 ${i+1} 页发生未授权变化，未提交本次修改`);
}
export async function exportPageRevision(base,buffer,{page,operations,rootId,revision,restoreSlide,onPhase=()=>{}}={}){
 const id=randomUUID(),folder=path.join(dataDir,'outputs',id);await fs.mkdir(folder,{recursive:true});onPhase('PowerPoint检查当前版本的真实文字边界');
 const original=await fs.readFile(path.join(dataDir,'outputs',base.id+'.pptx')),fit=await fitNativeText(buffer,folder,{audit:base.audit});if(fit.status!=='checked')throw Error('Office文字检查暂不可用，原版本和本页对话已保留');await assertOtherSlidesUnchanged(original,fit.buffer,page);
 const plan=structuredClone(base.plan);plan.conversationRootId=rootId;if(restoreSlide)plan.slides[page]=structuredClone(restoreSlide);plan.slides[page].nativeEdits=mergeNativeEdits(plan.slides[page].nativeEdits,operations);
 const titleEdit=operations.find(o=>o.type==='text'&&base.__inspection?.shapes.find(s=>s.id===o.shapeId&&(/^(Text 2|.*main-title.*)$/.test(s.name)||s.text===plan.slides[page].title)));if(titleEdit)plan.slides[page].title=titleEdit.text;
 const info={...base,id,plan,conversationRootId:rootId,revisionNumber:revision,parentOutputId:base.id,editedPage:page,createdAt:new Date().toISOString(),url:`/api/files/${id}.pptx`,bundleUrl:`/api/bundles/${id}`,textFit:{status:fit.status,corrections:fit.corrections},render:{status:'rendering'}};delete info.__inspection;
 await fs.writeFile(path.join(dataDir,'outputs',id+'.pptx'),fit.buffer);onPhase('生成修改后的真实页面预览');await renderPowerPoint(path.join(dataDir,'outputs',id+'.pptx'),path.join(dataDir,'previews',id),id);const render=renderStates.get(id);if(render?.status!=='ready'||render.pages!==base.pages)throw Error('实际页面预览尚未完成，未覆盖原版本');info.render=render;
 let bundle;try{bundle=await JSZip.loadAsync(await fs.readFile(path.join(dataDir,'outputs',base.id+'.zip')));}catch{bundle=new JSZip();}
 for(const name of Object.keys(bundle.files))if(/^[^/]+\.pptx$/i.test(name))bundle.remove(name);bundle.file(plan.title.replace(/[<>:"/\\|?*]/g,'_')+'.pptx',fit.buffer);
 for(let n=1;n<=base.pages;n++)bundle.file(`previews/${n}.png`,await fs.readFile(path.join(dataDir,'previews',id,n+'.png')));
 const pagePlan={title:plan.title,pages:plan.slides.map((s,i)=>({page:i+1,title:s.title,bullets:s.bullets,nativeEdits:s.nativeEdits}))};bundle.file('page-plan.json',JSON.stringify(pagePlan,null,2));await fs.writeFile(path.join(folder,'page-plan.json'),JSON.stringify(pagePlan,null,2));info.pagePlanUrl=`/api/output-assets/${id}/page-plan.json`;
 for(const key of ['parametersUrl','harnessReviewUrl'])if(info[key]?.includes('/api/output-assets/')){const name=decodeURIComponent(info[key].split('/').pop());try{await fs.copyFile(path.join(dataDir,'outputs',base.id,name),path.join(folder,name));info[key]=`/api/output-assets/${id}/${encodeURIComponent(name)}`;}catch{delete info[key];}}
 await fs.writeFile(path.join(dataDir,'outputs',id+'.zip'),await bundle.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));await fs.writeFile(path.join(dataDir,'outputs',id+'.json'),JSON.stringify(info,null,2));try{await workspaceLibrary.syncKnownOutput(info);}catch(e){info.projectSync={status:'failed',message:e.message};await fs.writeFile(path.join(dataDir,'outputs',id+'.json'),JSON.stringify(info,null,2));}return info;
}
