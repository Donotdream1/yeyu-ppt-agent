import fs from 'node:fs/promises';
import {currentModelConnection} from './model-connections.mjs';
import {officeSkillCatalog} from './office-skills.mjs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {dataDir} from './library.mjs';
import {hermesRuntimePaths,inspectHermesRuntime,requireHermesRuntime} from './hermes-runtime.mjs';
import {currentTaskSignal,throwIfTaskStopped,taskStoppedError,isTaskStopped} from './task-control.mjs';

export const HERMES_SOURCE=hermesRuntimePaths().sourcePath;
export const HERMES_PYTHON=hermesRuntimePaths().pythonPath;
export async function hermesRuntimeStatus(){
 const runtime=await inspectHermesRuntime();
 return {available:runtime.available,diagnostics:{pythonExists:runtime.pythonExists,missingSourceFiles:runtime.missingSourceFiles},engine:'Hermes AIAgent',model:currentModelConnection()?.model||'DeepSeek',skills:['template-design','page-edit','ppt-writing','chart-drawing','material-use','layout-review','harness-review','presentation-style','research-defense-layout',...officeSkillCatalog.map(s=>s.name)]};
}
export function summarizeHermesLog(log){
 const lines=String(log).split('\n').filter(s=>/API call #\d+/.test(s)),number=(s,key)=>Number(s.match(new RegExp('(?:^|[ ,])'+key+'=(\\d+)'))?.[1]||0);
 return {modelRequests:lines.length,inputTokens:lines.reduce((n,s)=>n+number(s,'in'),0),outputTokens:lines.reduce((n,s)=>n+number(s,'out'),0),cacheReadTokens:lines.reduce((n,s)=>n+Number(s.match(/cache=(\d+)\//)?.[1]||0),0),apiLatencyMs:Math.round(lines.reduce((n,s)=>n+Number(s.match(/latency=([\d.]+)s/)?.[1]||0),0)*1000)};
}
// Tools use `pages` for both a page count (publish) and per-page records
// (editing). Logging must not assume every successful result is an array.
export function acceptedToolPages(result){
 if(!Array.isArray(result?.pages))return undefined;
 return result.pages.filter(p=>p!==null&&typeof p==='object'&&Number.isInteger(p.page)&&p.page>0&&p.ok!==false&&!p.error&&!p.issues?.length).map(p=>p.page);
}
export async function runHermes({id,apiKey,model,systemPrompt,message,tools,onTool,probe=false,prompts={},maxIterations=45,maxTokens=26000,timeoutMs=900000,completeWhen,onMetrics=()=>{},role='coordinator',allowSkillTool=true,images=[],onVision=()=>{}}){
 throwIfTaskStopped();const signal=currentTaskSignal();
 const runtime=await requireHermesRuntime();
 throwIfTaskStopped();
 const connection=currentModelConnection();if(connection){apiKey=connection.apiKey;model=connection.model;}
 const started=Date.now(),metrics={role,runId:id,toolCalls:0,toolFailures:0,toolMs:0,systemPromptChars:systemPrompt?.length||0,messageChars:typeof message==='string'?message.length:JSON.stringify(message||'').length,imageCount:images.length};
 const redact=value=>{const serialized=JSON.stringify(value);return serialized&&apiKey?JSON.parse(serialized.split(apiKey).join('[hidden]')):value;};
 const home=path.join(dataDir,'hermes-runs',id,'home');await fs.mkdir(path.join(home,'skills'),{recursive:true});
 // Workers have a tiny, known tool surface. Deferring it adds a describe-tool
 // model round before every useful call. This config is local to this run only.
 await fs.writeFile(path.join(home,'config.yaml'),'tools:\n  tool_search:\n    enabled: "off"\n','utf8');
 if(allowSkillTool)await fs.cp(path.resolve('agents/skills'),path.join(home,'skills'),{recursive:true});
 for(const [name,prompt]of Object.entries(prompts))if(['ppt-writing','chart-drawing'].includes(name)&&prompt){const refs=path.join(home,'skills',name,'references');await fs.mkdir(refs,{recursive:true});await fs.writeFile(path.join(refs,'user-rules.md'),prompt,'utf8');}
 return new Promise((resolve,reject)=>{
  try{throwIfTaskStopped();}catch(e){reject(e);return;}
  const child=spawn(runtime.pythonPath,['-u',path.resolve('agents/hermes_worker.py')],{cwd:path.resolve('.'),windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',HERMES_HOME:home},stdio:['pipe','pipe','pipe']});
  let finished=false,chain=Promise.resolve(),errors='',finalized=false;
  const awaitFinal=async(event,failure)=>{if(finalized)return;finalized=true;signal?.removeEventListener('abort',onAbort);try{try{Object.assign(metrics,summarizeHermesLog(await fs.readFile(path.join(home,'logs','agent.log'),'utf8')));}catch{}metrics.elapsedMs=Date.now()-started;onMetrics({...metrics});const result=redact({...event,metrics});await fs.writeFile(path.join(dataDir,'hermes-runs',id,'final.json'),JSON.stringify(result));if(failure)reject(failure);else resolve(result);}catch(e){reject(e);}};
  const timer=setTimeout(()=>{finished=true;child.kill();const error=new Error('Hermes 子任务超时，已完成页面保存在断点中');void awaitFinal({type:'error',error:error.message},error);},timeoutMs);
  const onAbort=()=>{if(finalized)return;finished=true;clearTimeout(timer);child.kill();void chain.catch(()=>{}).then(()=>awaitFinal({type:'stopped',error:'用户已停止任务'},taskStoppedError()));};signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();
  const lines=readline.createInterface({input:child.stdout});
  child.stderr.setEncoding('utf8');child.stderr.on('data',s=>{errors=(errors+s).slice(-4000);});
  lines.on('line',line=>{let event;try{event=JSON.parse(line);}catch{return;}if(signal?.aborted)return;
   if(event.type==='vision_status'){metrics.vision=redact(event.vision||event);onVision(metrics.vision);}
   else if(event.type==='tool')chain=chain.then(async()=>{if(finished)return;const began=Date.now();let result;try{throwIfTaskStopped();result=await onTool(event.name,event.arguments);throwIfTaskStopped();}catch(e){if(isTaskStopped(e))throw e;result={error:e.message,issues:e.issues};}result=redact(result);const ok=!result?.error&&result?.ok!==false&&!result?.errors?.length;metrics.toolCalls++;metrics.toolMs+=Date.now()-began;if(!ok)metrics.toolFailures++;await fs.appendFile(path.join(dataDir,'hermes-runs',id,'tool-events.jsonl'),JSON.stringify({name:event.name,role,at:new Date().toISOString(),durationMs:Date.now()-began,error:result?.error,errors:result?.errors,acceptedPages:acceptedToolPages(result),ok})+'\n');throwIfTaskStopped();if(completeWhen?.(event.name,result,{vision:metrics.vision})){finished=true;clearTimeout(timer);awaitFinal({type:'complete',final:'阶段结果已提交',stoppedAfterTool:true,vision:metrics.vision});child.kill();return;}if(!child.stdin.destroyed)child.stdin.write(JSON.stringify({id:event.id,result})+'\n');}).catch(e=>{finished=true;clearTimeout(timer);child.kill();void awaitFinal({type:'error',error:e.message},e);});
   else if(event.type==='complete'||event.type==='ready'){finished=true;clearTimeout(timer);awaitFinal(event);child.stdin.end();}
   else if(event.type==='error'){finished=true;clearTimeout(timer);const error=new Error('Hermes：'+event.error.replaceAll(apiKey||'__NONE__','[hidden]'));void awaitFinal({type:'error',error:error.message},error);}
  });
  child.on('error',()=>{finished=true;clearTimeout(timer);const error=new Error('Hermes 运行环境不可用，请检查项目运行时设置');void awaitFinal({type:'error',error:error.message},error);});
  child.on('close',code=>{clearTimeout(timer);if(!finished){finished=true;const error=new Error(`Hermes 任务退出（${code}），原稿已保留`);void awaitFinal({type:'error',error:error.message},error);}});
  child.stdin.on('error',()=>{});
  child.stdin.write(JSON.stringify({sourcePath:runtime.sourcePath,hermesHome:home,workspace:path.resolve('.'),baseUrl:connection?.baseUrl||'https://api.deepseek.com',apiKey,model,systemPrompt,message,tools,probe,maxIterations,maxTokens,allowSkillTool,images})+'\n');
 });
}
