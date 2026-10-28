import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import JSZip from 'jszip';
import {parse,serialize,elements,first,NS,openZip,slideOrder} from '../server/ooxml.mjs';
import {replaceTextPreservingStyles,fitMaterialText,normalizeFonts,preventTextAutofit} from '../server/typography.mjs';
import {readSourceTypography,freezeSourceFontSizes} from '../server/source-theme.mjs';
import {analyzeMaterial,createMaterialAnalysisCache} from '../server/material-analysis.mjs';
import {composeDeck} from '../server/composition.mjs';
import {fitNativeText,nativeTextOverflowIssues} from '../server/native-text-fit.mjs';

const namespaces=`xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"`;
const richBody=`<p:txBody><a:bodyPr lIns="91440" rIns="80000"><a:normAutofit fontScale="85000"/></a:bodyPr><a:lstStyle/><a:p><a:pPr marL="9000"><a:spcAft><a:spcPts val="600"/></a:spcAft></a:pPr><a:r><a:rPr sz="2400" b="1"><a:solidFill><a:srgbClr val="164C78"/></a:solidFill></a:rPr><a:t>标题</a:t></a:r><a:r><a:rPr sz="1200"><a:solidFill><a:srgbClr val="B54A50"/></a:solidFill></a:rPr><a:t>补充说明</a:t></a:r></a:p></p:txBody>`;
const shape=(body=richBody,ph='')=>`<p:sp><p:nvSpPr><p:cNvPr id="2" name="源文本"/><p:cNvSpPr txBox="1"/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="100000" y="200000"/><a:ext cx="4000000" cy="1800000"/></a:xfrm></p:spPr>${body}</p:sp>`;

test('原生混合字号换文案后保留run字号、颜色、段落间距和文本框内边距，长文也不缩字',()=>{
 const doc=parse(`<root ${namespaces}>${shape()}</root>`),node=first(doc,'sp');
 const before=serialize(first(node,'spPr'));replaceTextPreservingStyles(doc,node,'这是需要填写到素材中的较长文案'.repeat(10));
 assert.deepEqual(elements(node,'rPr').map(n=>n.getAttribute('sz')),['2400','1200']);
 assert.deepEqual(elements(node,'srgbClr').map(n=>n.getAttribute('val')),['164C78','B54A50']);
 assert.equal(first(node,'bodyPr').getAttribute('lIns'),'91440');assert.equal(first(node,'spcPts').getAttribute('val'),'600');
 assert.equal(serialize(first(node,'spPr')),before);assert.equal(elements(node,'normAutofit').length,0);assert.equal(elements(node,'noAutofit').length,1);
 fitMaterialText(node,{role:'label',font:24,position:{w:.2,h:.01}},'更长'.repeat(50),.25,{width:1000,height:562.5});
 assert.deepEqual(elements(node,'rPr').map(n=>n.getAttribute('sz')),['2400','1200']);
 const normalized=parse(normalizeFonts(serialize(doc)));assert.deepEqual(elements(normalized,'rPr').map(n=>n.getAttribute('sz')),['2400','1200']);
 assert.ok(elements(normalized,'ea').every(n=>n.getAttribute('typeface')==='微软雅黑'));
});

test('新文案没有显式换行时，不按原段长度把预设定温度拆成单字行',()=>{
 const p=text=>`<a:p><a:r><a:rPr sz="1400"/><a:t>${text}</a:t></a:r></a:p>`;
 const doc=parse(`<root ${namespaces}>${shape('<p:txBody><a:bodyPr/>'+p('预设定')+p('温')+p('度')+'</p:txBody>')}</root>`),node=first(doc,'sp');
 replaceTextPreservingStyles(doc,node,'预设定温度');assert.equal(elements(node,'p').length,1);
 assert.equal(elements(node,'t').map(n=>n.textContent).join(''),'预设定温度');assert.deepEqual(elements(node,'rPr').map(n=>n.getAttribute('sz')),['1400']);
 replaceTextPreservingStyles(doc,node,'预设定\n温度');assert.equal(elements(node,'p').length,2);
 assert.deepEqual(elements(node,'rPr').map(n=>n.getAttribute('sz')),['1400','1400']);
});

test('保留源spAutoFit扩框行为，仅禁止normAutofit缩字号，已有noAutofit不改写',()=>{
 const doc=parse(`<root ${namespaces}>${shape(richBody.replace('<a:normAutofit fontScale="85000"/>','<a:spAutoFit/>'))}</root>`),node=first(doc,'sp');
 replaceTextPreservingStyles(doc,node,'保持字号并由Office扩大源文字框');
 const normalized=parse(normalizeFonts(serialize(doc)));
 assert.equal(elements(normalized,'spAutoFit').length,1);assert.equal(elements(normalized,'noAutofit').length,0);assert.equal(elements(normalized,'normAutofit').length,0);
 assert.deepEqual(elements(normalized,'rPr').map(n=>n.getAttribute('sz')),['2400','1200']);assert.equal(first(normalized,'bodyPr').getAttribute('lIns'),'91440');
 const fixed=parse(`<root ${namespaces}>${shape(richBody.replace('<a:normAutofit fontScale="85000"/>','<a:noAutofit/>'))}</root>`),before=serialize(first(fixed,'bodyPr'));
 preventTextAutofit(fixed);assert.equal(serialize(first(fixed,'bodyPr')),before);
});

async function sourceFixture(body=richBody){
 const zip=new JSZip();
 zip.file('[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`);
 zip.file('ppt/slides/slide1.xml',`<p:sld ${namespaces}><p:cSld><p:spTree>${shape(body,'<p:ph type="body" idx="1"/>')}</p:spTree></p:cSld></p:sld>`);
 zip.file('ppt/slides/_rels/slide1.xml.rels',`<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${NS.r}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
 zip.file('ppt/slideLayouts/slideLayout1.xml',`<p:sldLayout ${namespaces}><p:cSld><p:spTree>${shape('<p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr sz="2200"/></a:lvl1pPr></a:lstStyle><a:p/></p:txBody>','<p:ph type="body" idx="1"/>')}</p:spTree></p:cSld></p:sldLayout>`);
 zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels',`<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${NS.r}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
 zip.file('ppt/slideMasters/slideMaster1.xml',`<p:sldMaster ${namespaces}><p:cSld><p:spTree/></p:cSld><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr><a:lvl2pPr><a:defRPr sz="2000"/></a:lvl2pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`);
 zip.file('ppt/presentation.xml',`<p:presentation ${namespaces}><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="900"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`);
 return {zip,buffer:await zip.generateAsync({type:'nodebuffer'})};
}

test('解析源layout和master继承字号：不被18pt槽位默认值或目标模板字号覆盖',async()=>{
 const body='<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>继承布局字号</a:t></a:r><a:r><a:rPr sz="1400"/><a:t>小字</a:t></a:r></a:p><a:p><a:pPr lvl="1"/><a:r><a:t>继承母版二级字号</a:t></a:r></a:p></p:txBody>';
 const {zip,buffer}=await sourceFixture(body),context=await readSourceTypography(zip,'ppt/slides/slide1.xml'),doc=parse(await zip.file('ppt/slides/slide1.xml').async('string'));
 freezeSourceFontSizes(first(doc,'sp'),context);
 assert.deepEqual(elements(doc,'rPr').map(n=>n.getAttribute('sz')),['2200','1400','2000']);
 const cache=createMaterialAnalysisCache({readSource:async()=>buffer});
 const c=await analyzeMaterial({id:'inherited',sourceId:'fixture',part:'ppt/slides/slide1.xml',nodeIndices:[0],width:12192000,height:6858000},{cache});
 assert.equal(c.slots[0].font,22);
 const explicit=await sourceFixture('<p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1400"/><a:t>实际14磅</a:t></a:r></a:p></p:txBody>');
 const explicitCache=createMaterialAnalysisCache({readSource:async()=>explicit.buffer});
 const specific=await analyzeMaterial({id:'explicit',sourceId:'fixture',part:'ppt/slides/slide1.xml',nodeIndices:[0],width:12192000,height:6858000},{cache:explicitCache});
 assert.equal(specific.slots[0].font,14);assert.deepEqual(specific.slots[0].fontSizesPt,[14]);
});

test('原生表格单元格保留混合字号，缺失字号使用源master而不是目标模板',async()=>{
 const {zip}=await sourceFixture(),context=await readSourceTypography(zip,'ppt/slides/slide1.xml');
 const doc=parse(`<root ${namespaces}><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1500"/><a:t>表头</a:t></a:r><a:r><a:rPr sz="1000"/><a:t>单位</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>正文</a:t></a:r></a:p></a:txBody></a:tc></root>`);
 freezeSourceFontSizes(doc,context);for(const tc of elements(doc,'tc'))replaceTextPreservingStyles(doc,tc,'替换单元格文字');
 assert.deepEqual(elements(doc,'rPr').map(n=>n.getAttribute('sz')),['1500','1000','1800']);
});

test('缩放素材时短标题用源主字号统一混合字形，保留源字号审计与原色',async()=>{
 const {buffer}=await sourceFixture(),cache=createMaterialAnalysisCache({readSource:async()=>buffer});
 const component=await analyzeMaterial({id:'font-source',title:'原字号素材',sourceName:'源素材',sourceId:'fixture',part:'ppt/slides/slide1.xml',nodeIndices:[0],width:12192000,height:6858000},{cache});
 const templateBuffer=await fs.readFile(new URL('../server/base.pptx',import.meta.url));
 const template={id:'test',sourceId:'template',width:12192000,height:6858000,pages:[{}],theme:{font:'微软雅黑',primary:'002060',text:'202020'},designPalette:{mode:'material'}};
 const block={id:'c1',type:'component',componentId:component.id,materialSnapshot:component,x:.05,y:.2,w:.4,h:.2,bindText:true,colorMode:'source',textBindings:component.slots.map(s=>({slot:s.index,key:s.key,text:'重新撰写文案',contentIds:['u1']}))};
 const out=await composeDeck({title:'原字号验证',slides:[{title:'原字号验证',kind:'content',bullets:['重新撰写文案'],blocks:[block]}]},template,[],{loadSource:async id=>id==='template'?templateBuffer:buffer});
 const z=await openZip(out.buffer),order=await slideOrder(z),doc=parse(await z.file(order.paths[0]).async('string')),group=first(doc,'grpSp');
 assert.deepEqual(elements(group,'rPr').map(n=>n.getAttribute('sz')),['1200','1200']);
 assert.deepEqual(elements(group,'srgbClr').map(n=>n.getAttribute('val')),['164C78','B54A50']);
 assert.equal(out.audit[0].preserveSourceFontSize,false);assert.equal(out.audit[0].textTargets[0].requestedTypography.fontSize,12);assert.deepEqual(out.audit[0].textTargets[0].sourceFontSizesPt.sort((a,b)=>a-b),[12,24]);
});

test('固定原字号的溢出测量返回准确表格页码/槽位并阻断导出，不调用字号修正',async()=>{
 const audit=[{page:2,componentId:'table',textTargets:[{shapeId:9,row:1,column:1,slot:0,key:'table:9:0:0',sourceFontSizesPt:[15]},{shapeId:9,row:2,column:2,slot:3,key:'table:9:1:1',sourceFontSizesPt:[13]}]}];
 const measurements=[{page:2,id:9,row:2,column:2,before:-2,size:-2,mixedFont:true,availableWidth:80,availableHeight:30,initialBoundWidth:85,initialBoundHeight:42,overflow:true,text:'需要精简的文字'}];
 const issues=nativeTextOverflowIssues(measurements,audit);assert.equal(issues[0].slot,3);assert.equal(issues[0].key,'table:9:1:1');assert.equal(issues[0].before,-2);assert.equal(issues[0].preserveSourceFontSize,true);
 const folder=path.resolve('test-output/source-font-'+randomUUID());await fs.mkdir(folder,{recursive:true});let calls=0;
 try{
  await assert.rejects(fitNativeText(Buffer.from('unchanged'),folder,{audit,inspectText:async()=>{calls++;return measurements;}}),e=>e.code==='PPT_TEXT_OVERFLOW'&&e.issues[0].slot===3);
  const source=Buffer.from('same-buffer'),result=await fitNativeText(source,folder,{inspectText:async()=>{calls++;return [];}});
  assert.equal(result.buffer,source);assert.deepEqual(result.corrections,[]);assert.equal(calls,2);
 }finally{for(const name of await fs.readdir(folder))await fs.unlink(path.join(folder,name));await fs.rmdir(folder);}
});
