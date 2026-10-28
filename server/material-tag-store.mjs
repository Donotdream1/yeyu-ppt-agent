import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicUpdateJson} from './atomic-json.mjs';
export const materialTagFile=path.resolve('data/material-pages.json');
let cached,mtime=-1;
export async function readMaterialTags(){
 try{const stat=await fs.stat(materialTagFile);if(cached&&stat.mtimeMs===mtime)return cached;const data=JSON.parse(await fs.readFile(materialTagFile,'utf8'));cached={...data,byId:new Map(data.pages.map(p=>[p.id,p])),bySourcePage:new Map(data.pages.map(p=>[p.sourceId+':'+p.page,p]))};mtime=stat.mtimeMs;return cached;}
 catch(e){if(e.code==='ENOENT')return {version:0,pages:[],byId:new Map(),bySourcePage:new Map()};throw e;}
}
export async function saveMaterialTags(pages,meta={}){
 await fs.mkdir(path.dirname(materialTagFile),{recursive:true});
 return atomicUpdateJson(materialTagFile,{pages:[]},current=>{const old=new Map((current.pages||[]).map(p=>[p.id,p]));current.pages=pages.map(p=>['已人工复核','已视觉复核'].includes(old.get(p.id)?.review?.status)?{...p,...old.get(p.id),thumbnail:p.thumbnail,componentIds:p.componentIds}:{...p,usage:old.get(p.id)?.usage,review:{...p.review,visualSelection:old.get(p.id)?.review?.visualSelection,visualAudit:old.get(p.id)?.review?.visualAudit}});Object.assign(current,meta,{updatedAt:new Date().toISOString()});});
}
export async function recordMaterialUses(output){
 const index=await readMaterialTags();if(!index.pages.length)return;
 const uses=(output.plan?.slides||[]).flatMap((slide,i)=>slide.materialSnapshot?[{slide,page:i+1,c:slide.materialSnapshot}]:[]);if(!uses.length)return;
 await atomicUpdateJson(materialTagFile,{},current=>{for(const {slide,page,c}of uses){const card=current.pages.find(p=>p.sourceId===c.sourceId&&p.page===c.page);if(!card)continue;card.usage={lastOutputId:output.id,lastPage:page,lastUsedAt:new Date().toISOString(),fontFamily:'微软雅黑',fontPolicy:(slide.materialBindings||[]).some(b=>b.style?.fontSize)?'源字号优先，包含显式字号调整':'源pt字号不变',textFit:output.textFit?.status,scope:'仅验证该输出模板及本次已填文案，不证明建议容量上限',slotCharacters:(slide.materialBindings||[]).filter(b=>!c.slots?.find(s=>s.index===b.slot)?.decorative).map(b=>({key:b.key,characters:Array.from(b.text||'').length}))};if(slide.visualSelection?.mode==='image-understanding')card.review.visualSelection={mode:'image-understanding',model:slide.visualSelection.model,evidence:slide.visualSelection.visionEvidence,at:new Date().toISOString()};}current.updatedAt=new Date().toISOString();});
}
export async function reviewMaterialTags(id,changes){
 const data=await readMaterialTags(),old=data.byId.get(id);if(!old)throw Error('素材页不存在');
 const {PAGE_PURPOSES,PAGE_LOGICS}=await import('./material-tags.mjs');
 if(changes.purpose&&!PAGE_PURPOSES.includes(changes.purpose))throw Error('页面用途不在标签字典中');if(changes.logic&&!PAGE_LOGICS.includes(changes.logic))throw Error('表达逻辑不在标签字典中');
 if(changes.moduleCount!==undefined&&(!Number.isInteger(changes.moduleCount)||changes.moduleCount<1||changes.moduleCount>50))throw Error('一级模块数应为1至50');
 if(changes.modules)for(const m of changes.modules){if(!old.capacity.modules.some(v=>v.id===m.id)||!Number.isInteger(m.min)||!Number.isInteger(m.max)||m.min<0||m.max<m.min||m.max>2000)throw Error('模块容量范围无效');}
 let result;await atomicUpdateJson(materialTagFile,{},current=>{const p=current.pages.find(p=>p.id===id);if(changes.purpose)p.purpose.main=changes.purpose;if(changes.logic)p.logic.primary=changes.logic;if(changes.moduleCount!==undefined){p.structure.moduleCount=changes.moduleCount;p.structure.moduleCountConfidence='高';}
  for(const value of changes.modules||[]){const m=p.capacity.modules.find(v=>v.id===value.id);m.bodyCapacity={min:value.min,max:value.max,confidence:changes.confirmed===true?'高':'中',basis:changes.confirmed===true?'人工逐页复核':'用户修改，待完整复核'};}
  p.structure.description=`${p.structure.centerCount?'1个中心＋':''}${p.structure.moduleCount??'待核查'}个${p.structure.centerCount?'支撑':'一级'}模块／${p.logic.primary}／${p.structure.layout}`;p.capacity.bodyTotal={min:p.capacity.modules.reduce((n,m)=>n+(m.bodyCapacity?.min||0),0)+(p.capacity.center?.bodyCapacity?.min||0),max:p.capacity.modules.reduce((n,m)=>n+(m.bodyCapacity?.max||0),0)+(p.capacity.center?.bodyCapacity?.max||0)};
  if(changes.confirmed===true){p.review={status:'已人工复核',method:'user-confirmed-preview',reviewedAt:new Date().toISOString()};p.capacity.confidence='高';}
  current.updatedAt=new Date().toISOString();result=p;});return result;
}
