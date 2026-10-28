import test from 'node:test';
import assert from 'node:assert/strict';
import {fillBnaCover,layoutBnaContent,removeCoverTemplateNotice} from '../server/bna-template.mjs';
import {parse,first,elements,textShape,NS} from '../server/ooxml.mjs';
import {absoluteNodeBounds} from '../server/components.mjs';
const root=content=>parse(`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:sld>`);

test('封面只移除商业资料示例提示，保留其他文本及图形，重复执行不误删',()=>{
 const doc=root(textShape(2,'商业资料 注意保存',0,0,100,20,12)+textShape(3,'商业资料\n注意保密',0,20,100,20,12)+textShape(4,'商业资料管理与保密方案',0,40,100,20,12)+textShape(5,'BNA',0,60,100,20,12));
 assert.equal(removeCoverTemplateNotice(doc),2);assert.deepEqual(elements(doc,'t').map(n=>n.textContent),['商业资料管理与保密方案','BNA']);assert.equal(removeCoverTemplateNotice(doc),0);
 const fallback=root(textShape(2,'商业资料 注意保存',0,0,100,20,12)+textShape(3,'汇报标题',0,40,100,20,30));fillBnaCover(fallback,{title:'汇报标题'},{});assert.equal(elements(fallback,'t').some(n=>n.textContent.includes('注意保存')),false);
});
test('BNA封面保留原生底稿，分层排布汇报信息且不猜测日期',()=>{
 const doc=root(textShape(2,'模板标题',100,200,500,100,30).replace('Text 2','文本框 33')+textShape(3,'2026年1月',100,400,500,100,20).replace('Text 3','文本框 21'));
 fillBnaCover(doc,{title:'党建融合工作汇报'},{coverTitleColor:'FFFFFF'});
 assert.deepEqual(elements(doc,'t').map(n=>n.textContent),['党建融合工作汇报','汇报时间：待补充','汇报单位：待补充','汇报人：XXX']);assert.ok(elements(doc,'srgbClr').every(n=>n.getAttribute('val')==='FFFFFF'));
 assert.deepEqual(elements(doc,'sp').map(n=>+first(n,'rPr').getAttribute('sz')),[4400,1800,2800,1800]);assert.equal(elements(doc,'cNvPr')[0].getAttribute('id'),'2');assert.equal(elements(doc,'cNvPr')[1].getAttribute('id'),'3');
});
test('内页主体紧靠标题，按等比变换保留结构与角度，标题深蓝并匹配章节导航',()=>{
 const canvas={width:12192000,height:6858000},doc=root(textShape(2,'2.1 示例',670560,1097280,10850880,617220,30)+`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="3"/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="1000000" y="2000000"/><a:ext cx="4000000" cy="2000000"/><a:chOff x="0" y="0"/><a:chExt cx="4000000" cy="2000000"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="4"/></p:nvSpPr><p:spPr><a:xfrm rot="2640000"><a:off x="0" y="0"/><a:ext cx="4000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="004695"/></a:solidFill></p:spPr></p:sp></p:grpSp>`);
 layoutBnaContent(doc,canvas,{bodyArea:{x:.04,y:.205,w:.92,h:.74},titleColor:'002060',sections:['课题背景','模型方法','实验验证','研究展望']},{sectionIndex:1},5,['课题背景','模型方法','实验验证','研究展望']);
 const group=elements(doc,'grpSp')[0],body=elements(group,'sp')[0],box=absoluteNodeBounds(body);assert.ok(Math.abs(box.y/canvas.height-.205)<.00001);assert.equal(first(body,'xfrm').getAttribute('rot'),'2640000');assert.ok(Math.abs(+first(group,'ext').getAttribute('cx')/+first(group,'ext').getAttribute('cy')-2)<.00001);
 const title=elements(doc,'sp')[0];assert.equal(first(title,'srgbClr').getAttribute('val'),'002060');assert.equal(first(title,'rPr').getAttribute('sz'),'3000');assert.equal(elements(doc,'t').filter(n=>n.textContent==='模型方法').length,1);
});
