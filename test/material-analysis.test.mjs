import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,elements,openZip,slideOrder} from '../server/ooxml.mjs';
import {editableTextTargets} from '../server/material-layouts.mjs';
import {validateAdaptation} from '../server/designer.mjs';
import {analyzeMaterial,chooseTextColor} from '../server/material-analysis.mjs';
import {readComponents} from '../server/components.mjs';
import {resolveTemplate} from '../server/studio.mjs';
import {autoCompose,composeDeck} from '../server/composition.mjs';
import {deckSchema} from '../server/planner.mjs';
import JSZip from 'jszip';
import {applyMeasuredFonts} from '../server/native-text-fit.mjs';

test('实测字号修正只修改指定原生文字，其他页面的 XML 保持原样',async()=>{
 const zip=new JSZip(),ns='http://schemas.openxmlformats.org/presentationml/2006/main',r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 zip.file('ppt/presentation.xml',`<p:presentation xmlns:p="${ns}" xmlns:r="${r}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`);
 zip.file('ppt/_rels/presentation.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${r}/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="${r}/slide" Target="slides/slide2.xml"/></Relationships>`);
 const xml=`<p:sld xmlns:p="${ns}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:sp><p:nvSpPr><p:cNvPr id="2"/></p:nvSpPr><p:txBody><a:p><a:r><a:rPr sz="1800"/><a:t>保留原文</a:t></a:r></a:p></p:txBody></p:sp></p:sld>`;
 zip.file('ppt/slides/slide1.xml',xml);zip.file('ppt/slides/slide2.xml',xml);
 const revised=await openZip(await applyMeasuredFonts(await zip.generateAsync({type:'nodebuffer'}),[{page:1,id:2,size:14,row:0,column:0}]));
 assert.equal(elements(parse(await revised.file('ppt/slides/slide1.xml').async('string')),'rPr')[0].getAttribute('sz'),'1400');
 assert.equal(await revised.file('ppt/slides/slide2.xml').async('string'),xml);
});

test('原来为空的文本框和表格单元格也需要分析，装饰图形不产生虚假文字位置',()=>{
 const xml='<root xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:sp><p:nvSpPr><p:cNvSpPr txBox="1"/></p:nvSpPr><p:txBody><a:p/></p:txBody></p:sp><p:sp><p:txBody><a:p/></p:txBody></p:sp><a:tc><a:txBody><a:p/></a:txBody></a:tc></root>',doc=parse(xml);
 assert.equal(editableTextTargets(doc).length,2);assert.equal(editableTextTargets(doc,{legacy:true}).length,0);
});
test('空文案、遗漏要点和数字丢失都会阻断通过；白底白字会修正为深色',()=>{
 const slide={title:'进展',bullets:['试用：完成12项']},c={slots:[{index:0,maxChars:30,required:true}]};
 const errors=validateAdaptation(slide,c,[{slot:0,text:'',contentIds:[]}]);assert.ok(errors.some(s=>s.includes('未填充')));assert.ok(errors.some(s=>s.includes('未出现在页面')));
 assert.ok(validateAdaptation(slide,c,[{slot:0,text:'完成试用',contentIds:['u1']}]).some(s=>s.includes('12')));
 const d=parse('<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:spPr/><p:txBody><a:p><a:r><a:rPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>白字</a:t></a:r></a:p></p:txBody></p:sp>');assert.equal(chooseTextColor(d.documentElement,[d.documentElement]),'23334A');
});
test('素材快照抵御同ID索引变化，文字按稳定ID填写且所有字体统一微软雅黑',async()=>{
 const catalog=await readComponents(),c=catalog.items.find(c=>c.scope==='full'&&c.purpose==='content'&&!c.dataRisk),snapshot=await analyzeMaterial(c),template=await resolveTemplate();
 const bindings=snapshot.slots.map(s=>({slot:s.index,key:s.key,text:s.fixed||'新内容'.slice(0,s.maxChars)})).reverse();
 const plan=deckSchema.parse(autoCompose({title:'版本固定回归',slides:[{title:'版本固定回归',kind:'content',bullets:['新内容'],materialId:c.id,materialSnapshot:snapshot,materialBindings:bindings}]},template,catalog.items));
 const changed=catalog.items.map(v=>v.id===c.id?{...v,nodeIndices:[0],slots:[]}:v),out=await composeDeck(plan,template,changed),zip=await openZip(out.buffer),order=await slideOrder(zip),doc=parse(await zip.file(order.paths[0]).async('string'));
 assert.equal(out.audit[0].nativeObjectCount,snapshot.nativeObjects);assert.match(elements(doc,'t').map(n=>n.textContent).join(''),/新内容/);
 for(const name of Object.keys(zip.files).filter(n=>/^ppt\/.*\.xml$/.test(n))){const d=parse(await zip.file(name).async('string'));for(const tag of ['latin','ea','cs','font','sym'])for(const n of elements(d,tag))if(n.hasAttribute('typeface'))assert.equal(n.getAttribute('typeface'),'微软雅黑',name);}
});
