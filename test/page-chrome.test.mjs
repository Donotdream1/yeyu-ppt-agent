import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPageChrome} from '../server/page-chrome.mjs';
import {parse,first,elements,NS} from '../server/ooxml.mjs';
const shape=(id,name,text,x,y,w,h)=>`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
test('按批注上移标题、删除页顶辅助文字，同时保留正文中的同名文字',()=>{
 const doc=parse(`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree>${shape(2,'Text 2','主标题',70,115,1139,65)}${shape(32,'小李PPT1','T2',965,194,244,28)}${shape(33,'正文','T2',965,400,244,28)}</p:spTree></p:cSld></p:sld>`);
 const edits=applyPageChrome(doc,{width:1280,height:720},{titleY:.112,removeAuxiliaryLabels:true},6,false);
 assert.equal(edits.removedLabels[0].id,'32');assert.equal(edits.titleMoved,true);assert.equal(elements(doc,'sp').length,2);assert.equal(first(first(elements(doc,'sp')[0],'xfrm'),'off').getAttribute('y'),'81');assert.equal(elements(doc,'t').at(-1).textContent,'T2');
});
test('素材顶部的职责和编号属于主体，不能仅因位置接近页眉而被删除',()=>{
 const doc=parse(`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree>${shape(13,'任意形状 12','04',900,194,244,28)}${shape(25,'文本框 24','宝信',900,210,244,28)}</p:spTree></p:cSld></p:sld>`);
 const edits=applyPageChrome(doc,{width:1280,height:720},{removeAuxiliaryLabels:true});assert.equal(edits.removedLabels.length,0);assert.deepEqual(elements(doc,'t').map(n=>n.textContent),['04','宝信']);
});
