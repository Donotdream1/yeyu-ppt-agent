import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,first} from '../server/ooxml.mjs';
import {nativeTextCapacity,pageOverflowFeedback,constrainOverflowRepair} from '../server/page-text-capacity.mjs';

test('容量按实际字号及组合内原生宽度估算，不使用整页缩放宽度',()=>{
 const doc=parse('<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3231692" cy="1015663"/></a:xfrm></p:spPr><p:txBody><a:bodyPr lIns="0" rIns="0"/><a:p><a:r><a:rPr sz="1400"/><a:t>正文</a:t></a:r></a:p></p:txBody></p:sp>');
 const c=nativeTextCapacity(doc.documentElement);assert.equal(c.fontSizePt,14);assert.equal(c.suggestedCjkCharsPerLine,17);assert.equal(c.explicitLines,1);assert.equal(c.estimateOnly,true);
});
test('宽度溢出反馈含实测值和保守行容量，以当前14pt优先于旧槽位12pt',()=>{
 const f=pageOverflowFeedback([{page:11,id:29,before:14,sourceFontSizesPt:[12],availableWidth:276.48,availableHeight:82.08,initialBoundWidth:284.125,initialBoundHeight:33.6,text:'本页文案'}],{shapes:[]})[0];
 assert.equal(f.currentFontSizePt,14);assert.equal(f.suggestedCjkCharsPerLine,18);assert.equal(f.overflowAxis,'width');assert.ok(f.widthRatio<1);assert.equal(f.measuredHeightPt,33.6);
});
test('只允许修复溢出对象，不扩写已通过文案，不缩字或删除正文',()=>{
 const previous=[{type:'text',shapeId:29,text:'左侧已通过',style:{bold:true}},{type:'text',shapeId:31,text:'右侧需要精简'}],feedback=[{shapeId:31,currentFontSizePt:14}];
 assert.throws(()=>constrainOverflowRepair({operations:[{type:'text',shapeId:29,text:'把左侧重新扩写成超出边界的长段落'}]},previous,feedback),/仅修复报错对象/);
 assert.throws(()=>constrainOverflowRepair({operations:[{type:'text',shapeId:31,text:'短句',style:{fontSize:12}}]},previous,feedback),/保留当前字号/);
 assert.throws(()=>constrainOverflowRepair({operations:[{type:'delete',shapeId:31}]},previous,feedback),/仅修复/);
 const p={operations:[{type:'text',shapeId:29,text:'左侧已通过'},{type:'text',shapeId:31,text:'右侧\n精简'}]};assert.equal(constrainOverflowRepair(p,previous,feedback),p);
});
