import {z} from 'zod';
import {createHash,randomUUID} from 'node:crypto';
import {openZip,slideOrder,parse,serialize,elements,first,NS,relPath} from './ooxml.mjs';
import {absoluteNodeBounds,absoluteNodeAxes,direct,nodeBounds} from './components.mjs';
import {replaceTextPreservingStyles,normalizeFonts} from './typography.mjs';
import {nativeTextCapacity} from './page-text-capacity.mjs';
import {readPageAsset} from './page-assets.mjs';
import {placeNativeNode,styleNativeShape,cloneNativeNode,addNativeShape} from './native-shape-edits.mjs';

const box=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),w:z.number().min(.01).max(1),h:z.number().min(.01).max(1)}).refine(b=>b.x+b.w<=1.001&&b.y+b.h<=1.001,'位置超出页面');
const frameBox=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),w:z.number().min(0).max(1),h:z.number().min(0).max(1)}).refine(b=>b.w+b.h>0&&b.x+b.w<=1.001&&b.y+b.h<=1.001,'位置超出页面或区域为空');
const style=z.object({bold:z.boolean().optional(),fontSize:z.number().min(10).max(80).optional(),align:z.enum(['left','center','right']).optional(),vAlign:z.enum(['top','middle','bottom']).optional()});
const color=z.string().regex(/^(?:#?[a-fA-F0-9]{6}|none)$/).transform(c=>c.replace(/^#/,'').toUpperCase().replace('NONE','none'));
const geometry=z.enum(['rect','roundRect','ellipse','rightArrow','leftArrow','chevron','diamond','triangle','hexagon','line']);
export const nativeEditSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('text'),shapeId:z.number().int().positive(),text:z.string().max(3000),style:style.optional()}),
 z.object({type:z.literal('image'),assetId:z.string().uuid(),targetShapeId:z.number().int().positive().optional(),box:box.optional(),fit:z.enum(['contain','cover']).default('contain')}).refine(v=>v.targetShapeId||v.box,'请指定图片框或放置区域'),
 z.object({type:z.literal('frame'),shapeId:z.number().int().positive(),box:frameBox,rotation:z.number().min(-180).max(180).optional()}),
 z.object({type:z.literal('style'),shapeId:z.number().int().positive(),fill:color.optional(),stroke:color.optional(),strokeWidth:z.number().min(0).max(6).optional(),geometry:geometry.optional()}),
 z.object({type:z.literal('delete'),shapeId:z.number().int().positive()}),
 z.object({type:z.literal('clone'),shapeId:z.number().int().positive(),box,operationId:z.string().uuid().default(()=>randomUUID())}),
 z.object({type:z.literal('shape'),box,operationId:z.string().uuid().default(()=>randomUUID()),geometry:geometry.default('roundRect'),fill:color.optional(),stroke:color.optional(),strokeWidth:z.number().min(0).max(6).optional(),text:z.string().max(300).optional(),fontSize:z.number().min(10).max(80).optional(),textColor:z.string().regex(/^#?[a-fA-F0-9]{6}$/).transform(v=>v.replace(/^#/,'').toUpperCase()).optional()})
]);
export function mergeNativeEdits(previous=[],incoming=[]){
 const result=structuredClone(previous);for(const raw of incoming){const op=nativeEditSchema.parse(raw),key=o=>o.operationId?'operation:'+o.operationId:o.type==='image'?o.targetShapeId?'image:'+o.targetShapeId:'asset:'+o.assetId:o.type+':'+o.shapeId,index=result.findIndex(o=>key(o)===key(op));if(index<0)result.push(op);else result[index]={...result[index],...op,...(op.type==='text'?{style:{...result[index].style,...op.style}}:{})};}if(result.length>300)throw Error('本页修改过多，请重新选择素材后继续');return result;
}
export async function inspectNativePage(buffer,page){
 const zip=await openZip(buffer),order=await slideOrder(zip);if(!Number.isInteger(page)||!order.paths[page])throw Error('页面编号无效');
 const part=order.paths[page],xml=await zip.file(part).async('string'),doc=parse(xml),presentation=parse(await zip.file('ppt/presentation.xml').async('string')),size=first(presentation,'sldSz'),canvas={width:+size.getAttribute('cx'),height:+size.getAttribute('cy')};
 const shapes=[...elements(doc,'sp'),...elements(doc,'pic'),...elements(doc,'grpSp'),...elements(doc,'cxnSp'),...elements(doc,'graphicFrame')].map(node=>{const props=first(node,'cNvPr'),b=absoluteNodeBounds(node);if(!props||!b)return null;const text=elements(node,'t').map(t=>t.textContent).join(''),kind=node.localName==='grpSp'?'group':node.localName==='pic'?'image':node.localName==='graphicFrame'?'diagram':first(node,'txBody')?'text':'shape',frame={x:b.x/canvas.width,y:b.y/canvas.height,w:b.w/canvas.width,h:b.h/canvas.height};return {id:+props.getAttribute('id'),name:props.getAttribute('name'),type:kind,text:kind==='group'?text.slice(0,180):text,box:frame,parentId:(()=>{for(let p=node.parentNode;p;p=p.parentNode)if(p.localName==='grpSp')return +first(p,'cNvPr')?.getAttribute('id');})(),geometry:direct(direct(node,'spPr'),'prstGeom')?.getAttribute('prst'),fill:(()=>{const fill=direct(direct(node,'spPr'),'solidFill');return fill&&first(fill,'srgbClr')?.getAttribute('val');})(),fontSize:+first(node,'rPr')?.getAttribute('sz')/100||undefined,textLayout:kind==='text'?nativeTextCapacity(node):undefined,photoCandidate:(kind==='image'||/照片|图片.*待|待.*图片|图片位/.test(text))&&frame.y>.12&&frame.w>.08&&frame.h>.07};}).filter(Boolean);
 return {page,canvas,part,fingerprint:createHash('sha256').update(xml).digest('hex'),shapes};
}
function setTextStyle(node,value={}){
 const doc=node.ownerDocument,body=first(node,'txBody');if(!body)return;
 for(const p of elements(body,'p')){let pp=direct(p,'pPr');if(!pp){pp=doc.createElementNS(NS.a,'a:pPr');p.insertBefore(pp,p.firstChild);}pp.setAttribute('hangingPunct','0');pp.setAttribute('eaLnBrk','1');if(value.align)pp.setAttribute('algn',({left:'l',center:'ctr',right:'r'})[value.align]);}
 let props=direct(body,'bodyPr');if(!props){props=doc.createElementNS(NS.a,'a:bodyPr');body.insertBefore(props,body.firstChild);}props.setAttribute('wrap','square');if(value.vAlign)props.setAttribute('anchor',({top:'t',middle:'ctr',bottom:'b'})[value.vAlign]);
 for(const r of elements(body,'r'))if(!direct(r,'rPr'))r.insertBefore(doc.createElementNS(NS.a,'a:rPr'),r.firstChild);
 for(const key of ['rPr','defRPr','endParaRPr'])for(const p of elements(body,key)){if(value.bold!==undefined)p.setAttribute('b',value.bold?'1':'0');if(value.fontSize)p.setAttribute('sz',String(value.fontSize*100));}
}
export async function applyNativeEditsToDocument(zip,part,doc,rels,canvas,operations,{readAsset=readPageAsset,allowedAssetIds,contentTypesDoc}={}){
 const tree=first(doc,'spTree'),types=contentTypesDoc||parse(await zip.file('[Content_Types].xml').async('string'));
 for(const raw of operations){
  const op=nativeEditSchema.parse(raw),id=op.shapeId||op.targetShapeId,prop=id?elements(doc,'cNvPr').find(n=>+n.getAttribute('id')===id):null,node=prop?.parentNode?.parentNode;
  if(id&&(!node||!['sp','pic','grpSp','cxnSp','graphicFrame'].includes(node.localName)))throw Error(`对象 ${id} 不在当前页，或不能作为修改目标`);
  if(op.type==='frame'){placeNativeNode(node,op.box,canvas,op.rotation);continue;}
  if(op.type==='style'){styleNativeShape(node,op);continue;}
  if(op.type==='delete'){const ids=new Set(elements(node,'cNvPr').map(n=>n.getAttribute('id')));node.parentNode.removeChild(node);for(const key of ['stCxn','endCxn'])for(const n of [...elements(doc,key)])if(ids.has(n.getAttribute('id')))n.parentNode.removeChild(n);continue;}
  if(op.type==='clone'){const copy=cloneNativeNode(node,Math.max(...elements(doc,'cNvPr').map(n=>+n.getAttribute('id')))+1);placeNativeNode(copy,op.box,canvas);continue;}
  if(op.type==='shape'){const added=addNativeShape(doc,Math.max(...elements(doc,'cNvPr').map(n=>+n.getAttribute('id')))+1,op,canvas);setTextStyle(added,{align:'center',vAlign:'middle'});continue;}
  if(op.type==='text'){if(!first(node,'txBody'))throw Error(`对象 ${id} 不是可编辑文字`);replaceTextPreservingStyles(doc,node,op.text);setTextStyle(node,op.style);continue;}
  if(node&&!['sp','pic'].includes(node.localName))throw Error('照片只能替换具体图片或图形框');
  if(allowedAssetIds&&!allowedAssetIds.has(op.assetId))throw Error('只能使用本页对话中上传的照片');
  const asset=await readAsset(op.assetId),media=`ppt/media/user-${op.assetId}.png`;zip.file(media,asset.buffer);
  if(!elements(types,'Default').some(n=>n.getAttribute('Extension')==='png')){const n=types.createElementNS(types.documentElement.namespaceURI,'Default');n.setAttribute('Extension','png');n.setAttribute('ContentType','image/png');types.documentElement.appendChild(n);}
  let rid='rIdPhoto'+op.assetId.replaceAll('-','');if(!elements(rels,'Relationship').some(n=>n.getAttribute('Id')===rid)){const r=rels.createElementNS(NS.rel,'Relationship');r.setAttribute('Id',rid);r.setAttribute('Type',NS.r+'/image');r.setAttribute('Target','../media/user-'+op.assetId+'.png');rels.documentElement.appendChild(r);}
  const nativeId=id||Math.max(1,...elements(doc,'cNvPr').map(n=>+n.getAttribute('id')))+1;
  const pic=parse(`<p:pic xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:nvPicPr><p:cNvPr id="${nativeId}" name="UserPhoto:${op.assetId}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`).documentElement;
  const imported=doc.importNode(pic,true),xf=first(imported,'xfrm'),off=direct(xf,'off'),ext=direct(xf,'ext');
  let local,world;if(node){local=nodeBounds(node);world=absoluteNodeAxes(node);const oldProps=direct(node,'spPr'),old=direct(oldProps,'xfrm');if(old){for(const attr of ['rot','flipH','flipV'])if(old.hasAttribute(attr))xf.setAttribute(attr,old.getAttribute(attr));}const geometry=direct(oldProps,'prstGeom')||direct(oldProps,'custGeom');if(geometry)first(imported,'spPr').replaceChild(doc.importNode(geometry,true),first(imported,'prstGeom'));}else {local={x:op.box.x*canvas.width,y:op.box.y*canvas.height,w:op.box.w*canvas.width,h:op.box.h*canvas.height};world=local;}
  const imageRatio=asset.width/asset.height,frameRatio=world.w/world.h;
  if(op.fit==='contain'){const fw=imageRatio<frameRatio?imageRatio/frameRatio:1,fh=imageRatio>frameRatio?frameRatio/imageRatio:1;local={x:local.x+local.w*(1-fw)/2,y:local.y+local.h*(1-fh)/2,w:local.w*fw,h:local.h*fh};}
  else {const crop=doc.createElementNS(NS.a,'a:srcRect'),excess=imageRatio>frameRatio?(1-frameRatio/imageRatio)/2:(1-imageRatio/frameRatio)/2;for(const a of imageRatio>frameRatio?['l','r']:['t','b'])crop.setAttribute(a,String(Math.round(excess*100000)));first(imported,'blipFill').insertBefore(crop,first(imported,'stretch'));}
  for(const [key,v]of Object.entries({x:local.x,y:local.y}))off.setAttribute(key,String(Math.round(v)));ext.setAttribute('cx',String(Math.round(local.w)));ext.setAttribute('cy',String(Math.round(local.h)));
  if(node)node.parentNode.replaceChild(imported,node);else tree.appendChild(imported);
 }
 zip.file('[Content_Types].xml',serialize(types));return doc;
}
export async function patchNativePage(buffer,page,operations,options={}){
 const zip=await openZip(buffer),inspection=await inspectNativePage(buffer,page),doc=parse(await zip.file(inspection.part).async('string')),rels=parse(await zip.file(relPath(inspection.part)).async('string'));
 await applyNativeEditsToDocument(zip,inspection.part,doc,rels,inspection.canvas,operations,options);zip.file(inspection.part,normalizeFonts(serialize(doc),options.fontPolicy));zip.file(relPath(inspection.part),serialize(rels));return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
export async function restoreNativePage(currentBuffer,previousBuffer,page){
 const [current,previous]=await Promise.all([openZip(currentBuffer),openZip(previousBuffer)]),[a,b]=await Promise.all([slideOrder(current),slideOrder(previous)]);if(!a.paths[page]||a.paths[page]!==b.paths[page])throw Error('页面结构已变化，无法直接撤回旧修改');
 current.file(a.paths[page],await previous.file(b.paths[page]).async('nodebuffer'));current.file(relPath(a.paths[page]),await previous.file(relPath(b.paths[page])).async('nodebuffer'));return current.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
