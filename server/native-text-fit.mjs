import {throwIfTaskStopped} from './task-control.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {openZip,slideOrder,parse,serialize,elements,first,NS} from './ooxml.mjs';
import {queuePowerPoint} from './render.mjs';
import {applyMeasuredTextFrames} from './native-text-frames.mjs';

export async function applyMeasuredFonts(buffer,corrections){
 const zip=await openZip(buffer),order=await slideOrder(zip),pages=new Map();
 for(const change of corrections){
  if(!Number.isInteger(change.page)||!Number.isFinite(change.size)||change.size<8||change.size>80)throw new Error('PowerPoint 字号检查结果无效');
  const part=order.paths[change.page-1];if(!part)throw new Error('PowerPoint 文字检查页码无效');
  if(!pages.has(part))pages.set(part,parse(await zip.file(part).async('string')));
  const doc=pages.get(part),id=elements(doc,'cNvPr').find(n=>n.getAttribute('id')===String(change.id));
  let target=id?.parentNode?.parentNode;if(!target)throw new Error('PowerPoint 文字检查与原生对象不匹配');
  if(change.row){const rows=elements(target,'tr'),cells=Array.from(rows[change.row-1]?.childNodes||[]).filter(n=>n.localName==='tc');target=cells[change.column-1];}
  if(!target)throw new Error('原生表格位置检查失败');
  const textBody=first(target,'txBody')||target;for(const run of elements(textBody,'r'))if(!Array.from(run.childNodes).some(n=>n.localName==='rPr'))run.insertBefore(doc.createElementNS(NS.a,'a:rPr'),run.firstChild);
  for(const key of ['rPr','defRPr','endParaRPr'])for(const prop of elements(textBody,key)){const local=Number(prop.getAttribute('sz'))/100,measured=Number(change.before)>0;prop.setAttribute('sz',String(Math.round((measured&&local>0?local*change.size/change.before:change.size)*100)));}
 }
 for(const [part,doc]of pages)zip.file(part,serialize(doc));
 return pages.size?zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}):buffer;
}
async function inspect(file){
 return new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',path.resolve('scripts/fit-native-text.ps1'),'-InputFile',file,'-MeasureOnly'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',errors='';
  child.stdout.setEncoding('utf8');child.stdout.on('data',s=>output+=s);child.stderr.on('data',s=>errors+=s);
  const timer=setTimeout(()=>{child.kill();reject(new Error('PowerPoint 文字检查超时'));},120000);
  child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Object.assign(new Error('PowerPoint 文字检查不可用'),{code:'OFFICE_CHECK_UNAVAILABLE'}));try{const result=JSON.parse(output.trim().replace(/^\uFEFF/,''));if(!Array.isArray(result))throw Error();resolve(result);}catch{reject(new Error('PowerPoint 文字检查返回无效结果'));}});
 });
}
export async function retryNativeInspection(task,{wait=()=>new Promise(resolve=>setTimeout(resolve,1500)),onRetry=()=>{}}={}){
 throwIfTaskStopped();try{return await task();}catch(error){if(error.code!=='OFFICE_CHECK_UNAVAILABLE')throw error;onRetry();await wait();throwIfTaskStopped();return task();}
}
export function nativeTextOverflowIssues(measurements,audit=[]){
 return measurements.filter(c=>c.overflow||c.size<c.before||c.initialBoundWidth>c.availableWidth+1||c.initialBoundHeight>c.availableHeight+1).map(c=>{
  const matches=t=>t.shapeId===c.id&&(!c.row||(t.row===c.row&&t.column===c.column));
  const block=audit.find(a=>a.page===c.page&&a.textTargets?.some(matches)),slot=block?.textTargets?.find(matches);
  return {...c,componentId:block?.componentId,slot:slot?.slot,key:slot?.key,preserveSourceFontSize:true,sourceFontSizesPt:slot?.sourceFontSizesPt};
 });
}
export async function fitNativeText(buffer,folder,{audit=[],inspectText=inspect}={}){
 if(process.platform!=='win32'&&inspectText===inspect)return {buffer,status:'unavailable',corrections:[],warnings:['当前环境未执行 PowerPoint 文字边界检查']};
 return queuePowerPoint(async()=>{
  const file=path.join(folder,'text-fit-check.pptx');await fs.writeFile(file,buffer);
  try{
   let nativeRetries=0;const measure=()=>retryNativeInspection(()=>inspectText(file),{onRetry:()=>nativeRetries++});
   const measurements=await measure();let issues=nativeTextOverflowIssues(measurements,audit),frameAdjustments=[];
   if(issues.length&&inspectText===inspect){const adjusted=await applyMeasuredTextFrames(buffer,issues);if(adjusted.changes.length){buffer=adjusted.buffer;frameAdjustments=adjusted.changes;await fs.writeFile(file,buffer);issues=nativeTextOverflowIssues(await measure(),audit);}}
   if(issues.length){await fs.writeFile(path.join(folder,'text-fit-issues.json'),JSON.stringify({policy:'preserve-source-font-size',issues},null,2));const error=new Error('保持素材原字号时文字溢出，请精简对应文案或换用更合适的素材：'+issues.map(c=>`第 ${c.page} 页 slot ${c.slot??c.id}「${c.text}」`).join('；'));error.issues=issues;error.code='PPT_TEXT_OVERFLOW';throw error;}
   // The application only measures this file. Never rewrite source font sizes.
   return {buffer,status:'checked',corrections:[],frameAdjustments,nativeRetries,preserveSourceFontSize:true,warnings:[]};
  }catch(e){if(!/PowerPoint 文字检查不可用|PowerPoint 文字检查超时|PowerPoint 文字检查返回无效结果/.test(e.message))throw e;return {buffer,status:'unavailable',corrections:[],warnings:['未完成 PowerPoint 文字边界检查，请查看精确预览']};}
  finally{await fs.unlink(file).catch(()=>{});}
 });
}
