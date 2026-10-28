import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,elements,first,textShape,NS,serialize} from '../server/ooxml.mjs';
import {normalizePresentationOutline,coverFields} from '../server/presentation-outline.mjs';
import {fillBnaCover,styleBnaNavigation,BNA_NAVIGATION_STYLE} from '../server/bna-template.mjs';
import {bindingStyleSchema,applyBindingStyle} from '../server/binding-style.mjs';
import {slideSchema} from '../server/planner.mjs';
import {isSourceAuxiliaryCaption} from '../server/source-captions.mjs';

test('封面按主题、单位分层，目录不带正文编号，内容编号按章节连续',()=>{
 const p=normalizePresentationOutline({title:'BNA团委2026年工作回顾',slides:[{kind:'cover',title:'BNA团委2026年工作回顾',bullets:[]},{kind:'agenda',title:'四条主线',bullets:['一、工作概况','1.1 融合实践']},{kind:'content',title:'一、青年关怀',sectionIndex:0},{kind:'content',title:'数智培训',sectionIndex:0},{kind:'content',title:'1.1 下一步行动',sectionIndex:1},{kind:'ending',title:'谢谢'}]});
 assert.equal(p.cover.title,'2026年工作回顾');assert.equal(p.cover.unit,'BNA团委');assert.equal(p.slides[0].subtitle,'BNA团委');assert.equal(p.slides[1].title,'目录');assert.deepEqual(p.slides[1].bullets,['工作概况','融合实践']);assert.deepEqual(p.slides.slice(2,5).map(v=>v.title),['1.1 青年关怀','1.2 数智培训','2.1 下一步行动']);assert.equal(p.slides[5].title,'谢谢');
 assert.equal(coverFields({title:'研发中心2030年项目总结'}).unit,'研发中心');assert.equal(coverFields({title:'项目汇报'}).reportDate,'待补充');
 assert.equal(coverFields({cover:{title:'BNA团委2026年工作回顾',unit:'BNA团委'}}).title,'2026年工作回顾');
});

test('封面四层文本真实分框居中，汇报人与时间保持下方间距',()=>{
 const shape=(id,name)=>textShape(id,'原文字',0,0,500,100,20).replace(`name="Text ${id}"`,`name="${name}"`),doc=parse(`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree>${shape(33,'文本框 33')}${shape(21,'文本框 21')}</p:spTree></p:cSld></p:sld>`);
 fillBnaCover(doc,{title:'BNA团委2026年工作回顾',cover:{presenter:'XXX',reportDate:'2026年10月'}},{},{width:12192000,height:6858000});
 const shapes=elements(doc,'sp'),texts=shapes.map(s=>elements(s,'t').map(t=>t.textContent).join(''));for(const text of ['2026年工作回顾','BNA团委','汇报人：XXX','汇报时间：2026年10月'])assert.ok(texts.includes(text));
 assert.equal(shapes.length,4);assert.ok(elements(doc,'pPr').every(p=>p.getAttribute('algn')==='ctr'));const ys=shapes.map(s=>+first(s,'off').getAttribute('y'));assert.equal(new Set(ys).size,4);
});

test('顶部导航20pt微软雅黑加粗，靠近横线且不改变主标题',()=>{
 const doc=parse(`<root xmlns:p="${NS.p}" xmlns:a="${NS.a}">${textShape(1,'工作概况',1,1,100,24,16).replace('name="Text 1"','name="navigation:bna-nav-1"')}${textShape(2,'正文标题',0,50,300,40,30)}</root>`);
 styleBnaNavigation(doc,{width:960,height:540});assert.equal(BNA_NAVIGATION_STYLE.fontSize,20);const nav=elements(doc,'sp')[0];assert.ok(elements(nav,'rPr').every(p=>p.getAttribute('sz')==='2000'&&p.getAttribute('b')==='1'));assert.ok(elements(nav,'ea').every(p=>p.getAttribute('typeface')==='微软雅黑'));assert.equal(first(elements(doc,'sp')[1],'rPr').getAttribute('sz'),'3000');
});

test('显式文字样式从页面schema保留，居中加粗与字号生效且不改图形、颜色',()=>{
 const doc=parse(`<root xmlns:p="${NS.p}" xmlns:a="${NS.a}">${textShape(1,'交流\n分享',0,0,300,100,40,'164C78')}</root>`),node=first(doc,'sp'),before=serialize(first(node,'spPr'));
 applyBindingStyle(node,{fontSize:20,bold:true,align:'center',vAlign:'middle'});assert.ok(elements(node,'rPr').every(p=>p.getAttribute('sz')==='2000'&&p.getAttribute('b')==='1'));assert.ok(elements(node,'pPr').every(p=>p.getAttribute('algn')==='ctr'));assert.equal(first(node,'bodyPr').getAttribute('anchor'),'ctr');assert.equal(serialize(first(node,'spPr')),before);assert.equal(first(node,'srgbClr').getAttribute('val'),'164C78');
 const slide=slideSchema.parse({title:'讨论',bullets:['交流分享'],materialBindings:[{slot:0,text:'交流分享',style:{fontSize:20,bold:true,align:'center'}}]});assert.equal(slide.materialBindings[0].style.fontSize,20);assert.equal(bindingStyleSchema.safeParse({fontSize:8}).success,false);
});

test('源目录大标题只在目录布局中去重，普通正文中同名标题不误删',()=>{
 const slot={sample:'目录',key:'shape:3',position:{x:.03,y:.185,w:.187,h:.135}};assert.equal(isSourceAuxiliaryCaption(slot,{purpose:'agenda'}),true);assert.equal(isSourceAuxiliaryCaption(slot,{purpose:'content',relation:'parallel'}),false);
});
