import path from 'node:path';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {dataDir} from './library.mjs';
import {throwIfTaskStopped,isTaskStopped} from './task-control.mjs';
let queue=Promise.resolve();
const inFlight=new Map();
export function queuePowerPoint(task){const job=queue.then(()=>{throwIfTaskStopped();return task();});queue=job.catch(()=>{});return job;}
export const renderStates=new Map();
export function renderPowerPoint(input,out,key){
  const target=path.resolve(out);if(inFlight.has(target))return inFlight.get(target);
  renderStates.set(key,{status:'queued'});
  const job=queue.then(async()=>{throwIfTaskStopped();
    if(process.platform!=='win32'){renderStates.set(key,{status:'unavailable',message:'精确预览需要 Windows 版 PowerPoint'});return;}
    renderStates.set(key,{status:'rendering'});
    await fs.mkdir(out,{recursive:true});
    await new Promise(resolve=>{
      const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',path.resolve('scripts/render.ps1'),'-InputFile',input,'-OutputDir',out],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      let output='';child.stdout.on('data',d=>{output+=d;});child.stderr.on('data',()=>{});
      const timer=setTimeout(()=>{child.kill();renderStates.set(key,{status:'failed',message:'PowerPoint 预览超时，请直接打开 PPTX 查看'});resolve();},180000);
      child.on('error',()=>{clearTimeout(timer);renderStates.set(key,{status:'unavailable',message:'未找到 PowerPoint，仍可下载可编辑文件'});resolve();});
      child.on('close',code=>{clearTimeout(timer);renderStates.set(key,code===0?{status:'ready',pages:Number(output.match(/RENDERED:(\d+)/)?.[1]||0)}:{status:'unavailable',message:code===3?'PowerPoint 正在使用，已跳过预览。可关闭后重试':'PowerPoint 无法生成预览，请直接打开 PPTX 检查'});resolve();});
    });
  });queue=job.catch(e=>{renderStates.set(key,isTaskStopped(e)?{status:'stopped',message:'预览任务已停止'}:{status:'failed',message:'预览生成失败'});});inFlight.set(target,job);void job.finally(()=>inFlight.delete(target)).catch(()=>{});return job;
}
export const renderSource=id=>renderPowerPoint(path.join(dataDir,'sources',id+'.pptx'),path.join(dataDir,'previews',id),'source-'+id);
