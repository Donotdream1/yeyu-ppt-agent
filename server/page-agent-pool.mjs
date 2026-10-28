import {mapPageBatches} from './workflow-checkpoints.mjs';

export function pageScopedTools(tools,page){
 return tools.map(tool=>{const copy=structuredClone(tool),pages=copy.parameters?.properties?.pages;if(!pages?.items?.properties?.page)throw Error('页面工具缺少页码边界');pages.minItems=1;pages.maxItems=1;pages.items.properties.page={...pages.items.properties.page,type:'integer',enum:[page]};return copy;});
}

// Each page owns its context, tool boundary and retry history. Concurrency is
// bounded independently of the number of pages; settled pages never run again.
export async function runPageAgents(pages,{concurrency=4,isComplete=()=>false,worker,onProgress=()=>{},role='writer'}={}){
 if(!Array.isArray(pages)||pages.some(n=>!Number.isInteger(n)||n<1)||new Set(pages).size!==pages.length)throw Error('页面智能体需要不重复的有效页码');
 if(typeof worker!=='function')throw Error('缺少页面智能体处理函数');
 const pending=pages.filter(n=>!isComplete(n));
 return mapPageBatches(pending,{concurrency,batchSize:1,onProgress:p=>onProgress({...p,workers:p.workers.map(w=>({...w,id:w.pages.length?`${role}-page-${w.pages[0]}`:`${role}-slot-${w.workerId}`,role:w.pages.length?`${role}-page-${w.pages[0]}`:role}))}),worker:async([page],meta)=>{
  if(isComplete(page))return {page,skipped:true};
  return worker(page,{...meta,role:`${role}-page-${page}`});
 }});
}
