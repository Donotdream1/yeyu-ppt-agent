import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicUpdateJson} from './atomic-json.mjs';
import {createHash} from 'node:crypto';
import {openZip,slideOrder,parse,elements,first,serialize,NS,relPath,resolvePart} from './ooxml.mjs';
import {dataDir,sourceBuffer,readLibrary,update,importPptx} from './library.mjs';
import {readMaterialTags} from './material-tag-store.mjs';
import {reviewedPageClassification} from './material-tags.mjs';

export const direct=(n,name)=>Array.from(n?.childNodes||[]).find(c=>c.nodeType===1&&c.localName===name);
export const drawingNodes=doc=>Array.from(first(doc,'spTree')?.childNodes||[]).filter(n=>['sp','grpSp','pic','cxnSp','graphicFrame','AlternateContent'].includes(n.localName));
const drawingChildren=node=>Array.from(node?.childNodes||[]).filter(n=>['sp','grpSp','pic','cxnSp','graphicFrame','AlternateContent'].includes(n.localName));
export function componentNodes(doc,component){
  if(!component.nodePaths)return component.nodeIndices.map(i=>drawingNodes(doc)[i]);
  function prune(original,path,depth){if(!original)throw new Error('素材子元素路径已失效');if(depth>=path.length)return original.cloneNode(true);const clone=original.cloneNode(false);let index=0;for(const child of Array.from(original.childNodes)){if(['sp','grpSp','pic','cxnSp','graphicFrame','AlternateContent'].includes(child.localName)){if(index===path[depth])clone.appendChild(prune(child,path,depth+1));index++;}else clone.appendChild(child.cloneNode(true));}return clone;}
  return component.nodePaths.map(path=>prune(drawingNodes(doc)[path[0]],path,1));
}
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const identity=[1,0,0,1,0,0];
export function nodeParentMatrix(node){const parents=[];for(let p=node.parentNode;p;p=p.parentNode)if(p.localName==='grpSp')parents.unshift(p);return parents.reduce((m,p)=>multiply(m,groupMatrix(p)),identity);}
function groupMatrix(node){const tr=direct(direct(node,'grpSpPr'),'xfrm');if(!tr)return identity;const b=nodeBounds(node),co=direct(tr,'chOff'),ce=direct(tr,'chExt');if(!b||!co||!ce)return identity;const sx=b.w/(+ce.getAttribute('cx')||b.w||1),sy=b.h/(+ce.getAttribute('cy')||b.h||1),base=[sx,0,0,sy,b.x-(+co.getAttribute('x'))*sx,b.y-(+co.getAttribute('y'))*sy];const angle=(+tr.getAttribute('rot')||0)/60000*Math.PI/180,fx=tr.getAttribute('flipH')==='1'?-1:1,fy=tr.getAttribute('flipV')==='1'?-1:1,cx=b.x+b.w/2,cy=b.y+b.h/2;return multiply([Math.cos(angle)*fx,Math.sin(angle)*fx,-Math.sin(angle)*fy,Math.cos(angle)*fy,cx-Math.cos(angle)*fx*cx+Math.sin(angle)*fy*cy,cy-Math.sin(angle)*fx*cx-Math.cos(angle)*fy*cy],base);}
function transformBounds(box,matrix){const points=[[box.x,box.y],[box.x+box.w,box.y],[box.x,box.y+box.h],[box.x+box.w,box.y+box.h]].map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1]));return {x,y,w:Math.max(...points.map(p=>p[0]))-x,h:Math.max(...points.map(p=>p[1]))-y};}
export function nodeBounds(n){
  const props=direct(n,n.localName==='grpSp'?'grpSpPr':'spPr');
  const tr=direct(props,'xfrm')||direct(n,'xfrm');if(!tr)return null;
  const off=direct(tr,'off'),ext=direct(tr,'ext');if(!off||!ext)return null;
  const box={x:+off.getAttribute('x'),y:+off.getAttribute('y'),w:+ext.getAttribute('cx'),h:+ext.getAttribute('cy')};
  return box.w>=0&&box.h>=0?box:null;
}
export function absoluteNodeBounds(node){
 let n=node,box=nodeBounds(node);
 if(node.localName==='tc'){
  let frame=node.parentNode;while(frame&&frame.localName!=='graphicFrame')frame=frame.parentNode;
  const b=frame&&nodeBounds(frame);if(!b)return null;
  const rows=Array.from(node.parentNode.parentNode.childNodes).filter(n=>n.localName==='tr'),cols=elements(frame,'gridCol'),cells=Array.from(node.parentNode.childNodes).filter(n=>n.localName==='tc'),col=cells.indexOf(node),row=rows.indexOf(node.parentNode);
  box={x:b.x+cols.slice(0,col).reduce((s,n)=>s+(+n.getAttribute('w')),0),y:b.y+rows.slice(0,row).reduce((s,n)=>s+(+n.getAttribute('h')),0),w:+cols[col]?.getAttribute('w')||b.w/Math.max(1,cells.length),h:+rows[row]?.getAttribute('h')||b.h/Math.max(1,rows.length)};n=frame;
 }
 if(!box)return null;
 const parents=[];for(let p=n.parentNode;p;p=p.parentNode)if(p.localName==='grpSp')parents.unshift(p);
 let matrix=identity;for(const p of parents)matrix=multiply(matrix,groupMatrix(p));
 // Shape rotation is independent of its ancestor group rotation. Using only
 // off/ext treats a rotated thin crossbar as a tall post and shrinks the deck.
 const tr=direct(direct(n,n.localName==='grpSp'?'grpSpPr':'spPr'),'xfrm')||direct(n,'xfrm'),angle=(+tr?.getAttribute('rot')||0)/60000*Math.PI/180;
 if(angle){const frame=nodeBounds(n),cx=frame.x+frame.w/2,cy=frame.y+frame.h/2,c=Math.cos(angle),s=Math.sin(angle);matrix=multiply(matrix,[c,s,-s,c,cx-c*cx+s*cy,cy-s*cx-c*cy]);}
 return transformBounds(box,matrix);
}
export function absoluteNodeAxes(node){
 const box=nodeBounds(node);if(!box)return null;const parents=[];for(let p=node.parentNode;p;p=p.parentNode)if(p.localName==='grpSp')parents.unshift(p);
 let matrix=identity;for(const p of parents)matrix=multiply(matrix,groupMatrix(p));const xf=direct(direct(node,'spPr'),'xfrm'),angle=(+xf?.getAttribute('rot')||0)/60000*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return {w:box.w*Math.hypot(matrix[0]*c+matrix[2]*s,matrix[1]*c+matrix[3]*s),h:box.h*Math.hypot(-matrix[0]*s+matrix[2]*c,-matrix[1]*s+matrix[3]*c)};
}
export function unionBounds(boxes){const valid=boxes.filter(Boolean);if(!valid.length)return null;const x=Math.min(...valid.map(b=>b.x)),y=Math.min(...valid.map(b=>b.y));return {x,y,w:Math.max(...valid.map(b=>b.x+b.w))-x,h:Math.max(...valid.map(b=>b.y+b.h))-y};}
export const textNodes=n=>[...(n.localName==='sp'&&first(n,'txBody')?[n]:[]),...elements(n,'sp').filter(s=>first(s,'txBody'))];
const file=()=>path.join(dataDir,'components.json');
let componentCache=null,componentMtime=-1;
async function attachPageTags(db){const index=await readMaterialTags();if(db.pageTagRevision===index.updatedAt)return db;db.pageTagRevision=index.updatedAt;for(const c of db.items)if(c.layout||c.type==='chart'){c.sourcePurpose??=c.purpose;c.sourceRelation??=c.relation;c.pageTags=index.bySourcePage.get(c.sourceId+':'+c.page);Object.assign(c,reviewedPageClassification(c.pageTags,{purpose:c.sourcePurpose,relation:c.sourceRelation}));}return db;}
export async function readComponents(){try{const stat=await fs.stat(file());if(componentCache&&componentMtime===stat.mtimeMs)return attachPageTags(componentCache);componentCache=JSON.parse(await fs.readFile(file(),'utf8'));componentMtime=stat.mtimeMs;return attachPageTags(componentCache);}catch(e){if(e.code==='ENOENT')return {version:1,sources:[],items:[]};throw e;}}
let writeQueue=Promise.resolve();
export async function saveComponents(change){const op=writeQueue.then(()=>atomicUpdateJson(file(),{version:1,sources:[],items:[]},change));writeQueue=op.catch(()=>{});return op;}
function relation(text){return /循环|闭环|cycle/i.test(text)?'cycle':/对比|比较|compare/i.test(text)?'compare':/层|金字塔|架构|hierarchy/i.test(text)?'hierarchy':/流程|步骤|阶段|时间轴|路线|process/i.test(text)?'process':'parallel';}
export async function indexComponents(sourceId){
  const old=await readComponents();if(old.sourceVersions?.[sourceId]===2)return {sourceId,count:old.items.filter(c=>c.sourceId===sourceId).length,duplicate:true};
  const priorById=new Map(old.items.filter(c=>c.sourceId===sourceId).map(c=>[c.id,c]));
  const lib=await readLibrary(),source=lib.sources.find(s=>s.id===sourceId);if(!source)throw new Error('素材源不存在');
  const zip=await openZip(await sourceBuffer(sourceId)),order=await slideOrder(zip),items=[];
  for(let page=0;page<order.paths.length;page++){
    const part=order.paths[page],doc=parse(await zip.file(part).async('string')),nodes=drawingNodes(doc);
    const text=elements(doc,'t').map(t=>t.textContent).join(' '),iconBoard=!text.trim()&&nodes.length>=12;
    const label=text.trim().slice(0,65)||'图标';
    const add=(indices,type,suffix,nodePaths,boundsOverride)=>{
      const selected=nodePaths?componentNodes(doc,{nodePaths}):indices.map(i=>nodes[i]),bounds=boundsOverride||unionBounds(selected.map(nodeBounds))||{x:0,y:0,w:order.width*.3,h:order.height*.2};
      if(bounds.w<=0)bounds.w=order.width*.002;if(bounds.h<=0)bounds.h=order.height*.002;
      const dataKinds=[...(selected.some(n=>first(n,'chart'))?['chart']:[]),...(selected.some(n=>first(n,'tbl'))?['table']:[]),...(selected.some(n=>first(n,'oleObj'))?['ole']:[]),...(selected.some(n=>first(n,'relIds'))?['smartart']:[])];
      if(selected.length===1&&type!=='group'&&dataKinds.length)type=dataKinds[0];
      const texts=selected.flatMap(n=>textNodes(n)).map(n=>elements(first(n,'txBody'),'t').map(t=>t.textContent).join('')).filter(t=>t.trim());
      const id=`${sourceId}-${page+1}-${suffix}`;
      const prior=priorById.get(id),name=first(selected[0],'cNvPr')?.getAttribute('name');
      items.push({id,sourceId,sourceName:source.name,part,page:page+1,nodeIndices:indices,...(nodePaths?{nodePaths}:{}),bounds,width:order.width,height:order.height,type,relation:relation(label),editable:true,dataKinds,dataRisk:dataKinds.length>0,objectName:name||'',title:prior?.reviewed?prior.title:type==='icon'?`图标 ${page+1}-${indices[0]+1}`:type==='text'?texts.join(' ').slice(0,55)||'文本框':type==='chart'?'原生图表 · '+page:type==='table'?'可编辑表格 · '+page:name||label,tags:prior?.reviewed?prior.tags:[type,relation(label)],reviewed:prior?.reviewed||false,autoUse:prior?.autoUse,text:texts.join(' ').slice(0,500),textSlots:texts.length,nativeObjects:selected.reduce((s,n)=>s+elements(n,'cNvPr').length,0),thumbnail:`/api/components/${id}/preview`});
    };
    nodes.forEach((node,i)=>{
      const b=nodeBounds(node);
      if(node.localName==='grpSp')add([i],elements(node,'t').some(t=>t.textContent.trim())?'group':'icon','g'+i);
      else if(node.localName==='pic')add([i],'image','p'+i);
      else if(node.localName==='cxnSp')add([i],'connector','c'+i);
      else if(node.localName==='graphicFrame'||node.localName==='AlternateContent')add([i],'frame','f'+i);
      else if(node.localName==='sp')add([i],elements(node,'t').some(t=>t.textContent.trim())?'text':iconBoard||first(node,'custGeom')?'icon':'shape','s'+i);
      if(node.localName==='grpSp'){
        function visit(group,path,matrix){const m=multiply(matrix,groupMatrix(group));drawingChildren(group).forEach((child,j)=>{const childPath=[...path,j],box=nodeBounds(child),absolute=box?transformBounds(box,m):null;const kind=child.localName==='grpSp'?'group':child.localName==='pic'?'image':child.localName==='cxnSp'?'connector':child.localName==='graphicFrame'?'frame':elements(child,'t').some(t=>t.textContent.trim())?'text':first(child,'custGeom')?'icon':'shape';add([i],kind,'n'+childPath.join('_'),[childPath],absolute);if(child.localName==='grpSp')visit(child,childPath,m);});}
        visit(node,[i],identity);
      }
    });
    // A complete diagram is also indexed as one reusable component. Headers and footers stay out.
    const body=nodes.map((n,i)=>({n,i,b:nodeBounds(n)})).filter(v=>v.b&&v.b.y>order.height*.14&&v.b.y+v.b.h<order.height*.94&&v.b.x>=0&&v.b.x+v.b.w<=order.width*1.03);
    if(!iconBoard&&body.length>=3&&body.length<=100&&/流程|步骤|循环|金字塔|层次|逻辑|时间轴|关系|对比/.test(label))add(body.map(v=>v.i),'diagram','diagram');
  }
  const pageCache=new Map(),chartCache=new Map();
  for(const item of items.filter(c=>c.type==='chart')){
    let doc=pageCache.get(item.part);if(!doc){doc=parse(await zip.file(item.part).async('string'));pageCache.set(item.part,doc);}
    const node=componentNodes(doc,item).find(n=>first(n,'chart')),tag=node&&first(node,'chart'),rid=tag?.getAttribute('r:id'),rf=zip.file(relPath(item.part));
    if(rid&&rf){const rel=elements(parse(await rf.async('string')),'Relationship').find(r=>r.getAttribute('Id')===rid);const target=rel&&resolvePart(item.part,rel.getAttribute('Target'));if(target&&zip.file(target)){let chartDoc=chartCache.get(target);if(!chartDoc){chartDoc=parse(await zip.file(target).async('string'));chartCache.set(target,chartDoc);}item.chartKinds=['barChart','lineChart','pieChart','doughnutChart','scatterChart','areaChart','radarChart'].filter(k=>elements(chartDoc,k).length);item.chartDirection=first(chartDoc,'barDir')?.getAttribute('val')||'';}}
  }
  await saveComponents(db=>{db.items=db.items.filter(c=>c.sourceId!==sourceId);db.items.push(...items);if(!db.sources.includes(sourceId))db.sources.push(sourceId);db.sourceVersions={...db.sourceVersions,[sourceId]:2};db.version=2;});
  return {sourceId,count:items.length,duplicate:false};
}
export async function componentPreview(component){
  const sharp=(await import('sharp')).default;
  const source=path.join(dataDir,'previews',component.sourceId,component.page+'.png');
  const image=sharp(await fs.readFile(source));const meta=await image.metadata(),b=component.bounds;
  const left=Math.max(0,Math.floor(b.x/component.width*meta.width)-3),top=Math.max(0,Math.floor(b.y/component.height*meta.height)-3);
  const width=Math.max(1,Math.min(meta.width-left,Math.ceil(b.w/component.width*meta.width)+6)),height=Math.max(1,Math.min(meta.height-top,Math.ceil(b.h/component.height*meta.height)+6));
  return image.extract({left,top,width,height}).resize({width:480,height:300,fit:'inside',withoutEnlargement:false}).png().toBuffer();
}
export async function annotateComponent(id,changes){let item;await saveComponents(db=>{item=db.items.find(c=>c.id===id);if(!item)throw new Error('元素不存在');if(changes.title)item.title=String(changes.title).slice(0,100);if(Array.isArray(changes.tags))item.tags=changes.tags.slice(0,20).map(s=>String(s).slice(0,40));});return item;}

export async function registerTemplate(buffer,name,{activate=true}={}){
  const imported=await importPptx(buffer,name),zip=await openZip(buffer),order=await slideOrder(zip);
  let theme={font:'Microsoft YaHei',primary:'243C5A',secondary:'7186A0',text:'25333E',background:'FFFFFF'};
  const themeFile=Object.keys(zip.files).find(n=>/^ppt\/theme\/theme\d+\.xml$/.test(n));
  if(themeFile){const d=parse(await zip.file(themeFile).async('string')),scheme=first(d,'clrScheme');const color=key=>{const n=direct(scheme,key),c=n&&Array.from(n.childNodes).find(n=>n.nodeType===1);return c?.getAttribute('lastClr')||c?.getAttribute('val');};const colors=['accent1','accent2','accent3','accent4','accent5','accent6'].map(color).filter(v=>/^[0-9a-f]{6}$/i.test(v));const luminance=v=>parseInt(v.slice(0,2),16)*.2126+parseInt(v.slice(2,4),16)*.7152+parseInt(v.slice(4),16)*.0722;theme.primary=colors.find(v=>luminance(v)>35&&luminance(v)<160)||theme.primary;theme.secondary=colors.find(v=>luminance(v)>160&&luminance(v)<240)||theme.secondary;theme.text=color('dk1')||theme.text;theme.font=first(first(d,'minorFont'),'ea')?.getAttribute('typeface')||theme.font;}
  const record={id:imported.id,sourceId:imported.id,name,width:order.width,height:order.height,pages:order.paths.map((part,i)=>({part,page:i+1,thumbnail:`/api/previews/${imported.id}/${i+1}.png`})),theme,safeArea:{x:.055,y:.16,w:.89,h:.76},createdAt:new Date().toISOString()};
  await update(db=>{db.templates=(db.templates||[]).filter(t=>t.id!==record.id);db.templates.push(record);if(activate)db.activeTemplateId=record.id;const s=db.sources.find(s=>s.id===record.id);if(s&&activate)s.role='template';});return record;
}
export async function configureTemplate(id,changes){let record;await update(db=>{record=(db.templates||[]).find(t=>t.id===id);if(!record)throw new Error('模板不存在');if(changes.safeArea){const a=changes.safeArea;if(['x','y','w','h'].some(k=>!Number.isFinite(a[k]))||a.x<0||a.y<0||a.w<.1||a.h<.1||a.x+a.w>1||a.y+a.h>1)throw new Error('内容区域必须位于画布内');record.safeArea=a;}if(changes.theme){for(const k of ['primary','secondary','text'])if(/^[0-9a-f]{6}$/i.test(changes.theme[k]||''))record.theme[k]=changes.theme[k];if(changes.theme.font)record.theme.font=String(changes.theme.font).slice(0,100);}if(changes.activate)db.activeTemplateId=id;});return record;}
