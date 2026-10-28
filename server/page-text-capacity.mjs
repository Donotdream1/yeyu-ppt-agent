import {isDeepStrictEqual} from 'node:util';
import {elements,first} from './ooxml.mjs';
import {direct,nodeBounds} from './components.mjs';

export function nativeTextCapacity(node){
 const body=direct(node,'txBody'),bounds=nodeBounds(node);if(!body||!bounds)return undefined;
 const props=direct(body,'bodyPr'),sizeValues=['rPr','defRPr','endParaRPr'].flatMap(k=>elements(body,k)).map(n=>Number(n.getAttribute('sz'))/100).filter(n=>n>0);
 const fontSizePt=Math.max(0,...sizeValues),widthPt=Math.max(0,(bounds.w-(+props?.getAttribute('lIns')||0)-(+props?.getAttribute('rIns')||0))/12700),heightPt=Math.max(0,(bounds.h-(+props?.getAttribute('tIns')||0)-(+props?.getAttribute('bIns')||0))/12700);
 return {widthPt:Math.round(widthPt*100)/100,heightPt:Math.round(heightPt*100)/100,fontSizePt:fontSizePt||undefined,suggestedCjkCharsPerLine:fontSizePt?Math.max(1,Math.floor((widthPt-1)/fontSizePt*.95)):undefined,explicitLines:elements(body,'p').length+elements(body,'br').length,estimateOnly:true};
}
export function pageOverflowFeedback(issues,inspection){
 return (issues||[]).map(e=>{
  const shape=inspection.shapes.find(s=>s.id===e.id),fontSizePt=e.before>0?e.before:shape?.textLayout?.fontSizePt||shape?.fontSize||Math.max(0,...(e.sourceFontSizesPt||[])),width=e.availableWidth,height=e.availableHeight;
  return {shapeId:e.id,slot:e.slot,page:e.page,text:e.text,currentFontSizePt:fontSizePt||undefined,availableWidthPt:width,availableHeightPt:height,measuredWidthPt:e.initialBoundWidth,measuredHeightPt:e.initialBoundHeight,overflowAxis:e.initialBoundWidth>width+1?'width':'height',suggestedCjkCharsPerLine:fontSizePt&&width>0?Math.max(1,Math.floor((width-1)/fontSizePt*.95)):undefined,widthRatio:e.initialBoundWidth>0?Math.min(1,width/e.initialBoundWidth):undefined,action:'只精简此对象并按用户要求明确换行；保留当前字号及其他已通过的修改。字数是保守估算，仍以Office实测为准。'};
 });
}
const key=op=>op.operationId||op.type+':'+(op.shapeId||op.targetShapeId||op.assetId||'');
export function constrainOverflowRepair(proposal,previous,feedback){
 const ids=new Set(feedback.map(e=>e.shapeId)),old=new Map(previous.map(op=>[key(op),op]));
 for(const op of proposal.operations){
  const prior=old.get(key(op)),effective=prior?{...prior,...op,...(op.type==='text'&&(prior.style||op.style)?{style:{...prior.style,...op.style}}:{})}:op;
  if(prior&&isDeepStrictEqual(prior,effective))continue;
  if(!ids.has(op.shapeId)||!['text','frame'].includes(op.type))throw Error('本轮仅修复报错对象，其他已通过的文字、图片和布局必须保留');
  const issue=feedback.find(e=>e.shapeId===op.shapeId);if(op.style?.fontSize!==undefined&&op.style.fontSize!==issue.currentFontSizePt)throw Error('溢出修复必须保留当前字号，请精简文字或明确换行');
 }
 return proposal;
}
