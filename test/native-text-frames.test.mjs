import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {applyMeasuredTextFrames} from '../server/native-text-frames.mjs';
import {NS,parse,elements,first} from '../server/ooxml.mjs';

test('字体替换导致单字符箭头略宽时保持原字号和中心，不让模型反复改箭头文案',async()=>{
 const zip=await JSZip.loadAsync(await fixture(false));let xml=await zip.file('ppt/slides/slide1.xml').async('string');xml=xml.replace('cx="2540000" cy="254000"','cx="254000" cy="393700"').replace('职责','→');zip.file('ppt/slides/slide1.xml',xml);
 const out=await applyMeasuredTextFrames(await zip.generateAsync({type:'nodebuffer'}),[{page:1,id:3,slot:13,before:18,text:'→',initialBoundWidth:21.75,initialBoundHeight:21.6}]),z=await JSZip.loadAsync(out.buffer),doc=parse(await z.file('ppt/slides/slide1.xml').async('string'));
 assert.equal(first(doc,'rPr').getAttribute('sz'),'1800');assert.equal(first(doc,'t').textContent,'→');assert.ok(+first(doc,'ext').getAttribute('cx')>254000);assert.ok(Math.abs(+first(doc,'off').getAttribute('x')+ +first(doc,'ext').getAttribute('cx')/2-(10000+254000/2))<1);
});

async function fixture(auto=true){const z=new JSZip();z.file('ppt/presentation.xml',`<p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`);z.file('ppt/_rels/presentation.xml.rels',`<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${NS.r}/slide" Target="slides/slide1.xml"/></Relationships>`);z.file('ppt/slides/slide1.xml',`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="3"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="10000" y="20000"/><a:ext cx="2540000" cy="254000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr lIns="91440" rIns="91440" tIns="45720" bIns="45720">${auto?'<a:spAutoFit/>':'<a:noAutofit/>'}</a:bodyPr><a:p><a:r><a:rPr sz="1800" b="1"><a:solidFill><a:srgbClr val="004695"/></a:solidFill></a:rPr><a:t>职责</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);return z.generateAsync({type:'nodebuffer'});}
test('按源文字框自动适应意图扩展紧凑框，字号、颜色、文本与位置不变',async()=>{
 const input=await fixture(),out=await applyMeasuredTextFrames(input,[{page:1,id:3,before:18,availableWidth:185,availableHeight:13,initialBoundWidth:40,initialBoundHeight:22}]);
 const z=await JSZip.loadAsync(out.buffer),d=parse(await z.file('ppt/slides/slide1.xml').async('string'));
 assert.equal(first(d,'rPr').getAttribute('sz'),'1800');assert.equal(first(d,'srgbClr').getAttribute('val'),'004695');assert.equal(first(d,'t').textContent,'职责');assert.equal(first(d,'off').getAttribute('y'),'20000');assert.ok(+first(d,'ext').getAttribute('cy')>254000);assert.equal(out.changes[0].fontSizeChanged,false);
});
test('长段落不无限撑大框，不扩大没有源spAutoFit意图的框，不改表格行列',async()=>{
 for(const auto of [true,false]){const input=await fixture(auto),out=await applyMeasuredTextFrames(input,[{page:1,id:3,before:18,initialBoundWidth:180,initialBoundHeight:200},{page:1,id:3,row:1,column:1,before:18,initialBoundHeight:200}]),z=await JSZip.loadAsync(out.buffer),d=parse(await z.file('ppt/slides/slide1.xml').async('string'));assert.equal(first(d,'ext').getAttribute('cy'),'254000');assert.equal(elements(d,'rPr')[0].getAttribute('sz'),'1800');assert.equal(out.changes.length,1);}
});

test('缩放后放不下一个原字号汉字的小圆标记可等比扩展并保持中心，不挤占邻近文字',async()=>{
 const z=await JSZip.loadAsync(await fixture(false));let xml=await z.file('ppt/slides/slide1.xml').async('string');xml=xml.replace('x="10000" y="20000"','x="1000000" y="1000000"').replace('cx="2540000" cy="254000"','cx="225552" cy="225552"').replace('</p:spPr>','<a:prstGeom prst="ellipse"/></p:spPr>').replace('职责','稳');z.file('ppt/slides/slide1.xml',xml);
 const input=await z.generateAsync({type:'nodebuffer'}),issue={page:1,id:3,slot:5,before:18,text:'稳',initialBoundWidth:23.37504,initialBoundHeight:21.6},out=await applyMeasuredTextFrames(input,[issue]),deck=await JSZip.loadAsync(out.buffer),d=parse(await deck.file('ppt/slides/slide1.xml').async('string')),ext=first(d,'ext'),off=first(d,'off');
 assert.equal(first(d,'rPr').getAttribute('sz'),'1800');assert.equal(first(d,'t').textContent,'稳');assert.equal(ext.getAttribute('cx'),ext.getAttribute('cy'));assert.ok(+ext.getAttribute('cx')>225552);assert.ok(Math.abs(+off.getAttribute('x')+(+ext.getAttribute('cx'))/2-(1000000+225552/2))<=1);assert.equal(out.changes[0].centerBadge,true);
 const blocked=await JSZip.loadAsync(input);blocked.file('ppt/slides/slide1.xml',xml.replace('</p:spTree>','<p:sp><p:nvSpPr><p:cNvPr id="4"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1230000" y="1000000"/><a:ext cx="200000" cy="225552"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>邻近内容</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>'));const stop=await applyMeasuredTextFrames(await blocked.generateAsync({type:'nodebuffer'}),[issue]);assert.equal(stop.changes[0].centerBadge,false);
});
