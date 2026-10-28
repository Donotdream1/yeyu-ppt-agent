import {openZip,slideOrder,parse,serialize,elements,first} from './ooxml.mjs';
import {direct,nodeBounds,absoluteNodeBounds} from './components.mjs';

// Materialize the source's shape-to-fit-text intent without touching pt sizes.
// Only small, measured expansions are allowed; longer copy still goes to editing.
export async function applyMeasuredTextFrames(buffer,issues){
 const zip=await openZip(buffer),order=await slideOrder(zip),docs=new Map(),changes=[];
 for(const issue of issues){
  const part=order.paths[issue.page-1];if(!part||issue.row)continue;
  if(!docs.has(part))docs.set(part,parse(await zip.file(part).async('string')));const doc=docs.get(part),id=elements(doc,'cNvPr').find(n=>+n.getAttribute('id')===+issue.id),shape=id?.parentNode?.parentNode;
  if(shape?.localName!=='sp')continue;const body=first(shape,'bodyPr'),box=nodeBounds(shape),absolute=absoluteNodeBounds(shape);if(!body||!box||!absolute)continue;
  const sourceAutoGrow=Boolean(direct(body,'spAutoFit')),font=Math.max(Number(issue.before)||0,...(issue.sourceFontSizesPt||[])),frameWidth=absolute.w/12700,frameHeight=absolute.h/12700;
  // Font replacement can increase glyph metrics; reclaim padding before any
  // geometry change. The native object position and typography stay unchanged.
  for(const name of ['lIns','rIns','tIns','bIns'])body.setAttribute(name,'0');
  let width=frameWidth,height=frameHeight,centerBadge=false;
  if(sourceAutoGrow&&font>0){
   if(issue.initialBoundWidth>frameWidth&&issue.initialBoundWidth-frameWidth<=font*1.35)width=issue.initialBoundWidth+.5;
   if(issue.initialBoundHeight>frameHeight&&issue.initialBoundHeight-frameHeight<=font*1.35)height=issue.initialBoundHeight+.5;
  }
  // A source icon circle can become smaller than one glyph after fitting the
  // complete material into the user's template. Copy editing cannot fix that.
  // Allow a bounded, uniform expansion around its center at the original pt.
  const glyphs=Array.from(String(issue.text||'').trim()),isBadge=first(shape,'prstGeom')?.getAttribute('prst')==='ellipse'&&glyphs.length===1&&Number.isInteger(issue.slot)&&font>0&&frameWidth<=font*2&&frameHeight<=font*2;
  // Arial's arrow is slightly wider than the source CJK glyph. Copy editing
  // cannot shorten a one-character relationship; reclaim at most 0.35 em and
  // keep its center at the source position without changing its point size.
  const relationGlyph=glyphs.length===1&&/^[→←↑↓↔↕]$/.test(glyphs[0])&&Number.isInteger(issue.slot)&&font>0;
  if(relationGlyph&&issue.initialBoundWidth>frameWidth&&issue.initialBoundWidth-frameWidth<=font*.35){width=issue.initialBoundWidth+.5;centerBadge=true;}
  if(!sourceAutoGrow&&isBadge){
   const diameter=Math.max(frameWidth,frameHeight,Number(issue.initialBoundWidth)+.5,Number(issue.initialBoundHeight)+.5),factor=diameter/Math.min(frameWidth,frameHeight);
   const target={x:absolute.x-(diameter*12700-absolute.w)/2,y:absolute.y-(diameter*12700-absolute.h)/2,w:diameter*12700,h:diameter*12700};
   const overlapsText=elements(doc,'sp').filter(n=>n!==shape&&elements(first(n,'txBody')||n,'t').some(t=>t.textContent.trim())).some(n=>{const b=absoluteNodeBounds(n);return b&&Math.min(target.x+target.w,b.x+b.w)-Math.max(target.x,b.x)>1270&&Math.min(target.y+target.h,b.y+b.h)-Math.max(target.y,b.y)>1270;});
   if(Number.isFinite(diameter)&&factor<=1.6&&!overlapsText&&target.x>=0&&target.y>=0&&target.x+target.w<=order.width&&target.y+target.h<=order.height){width=diameter;height=diameter;centerBadge=true;}
  }
  const ext=direct(direct(shape,'spPr'),'xfrm')&&direct(direct(direct(shape,'spPr'),'xfrm'),'ext');
  if(ext){const newWidth=Math.round(width*12700/(absolute.w/box.w)),newHeight=Math.round(height*12700/(absolute.h/box.h));if(centerBadge){const off=direct(direct(direct(shape,'spPr'),'xfrm'),'off');off.setAttribute('x',String(Math.round(box.x-(newWidth-box.w)/2)));off.setAttribute('y',String(Math.round(box.y-(newHeight-box.h)/2)));}ext.setAttribute('cx',String(newWidth));ext.setAttribute('cy',String(newHeight));}
  changes.push({page:issue.page,id:issue.id,slot:issue.slot,key:issue.key,padding:'compact',sourceAutoGrow,centerBadge,widthBefore:frameWidth,heightBefore:frameHeight,widthAfter:width,heightAfter:height,fontSizeChanged:false});
 }
 for(const [part,doc]of docs)zip.file(part,serialize(doc));
 return {buffer:changes.length?await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}):buffer,changes};
}
