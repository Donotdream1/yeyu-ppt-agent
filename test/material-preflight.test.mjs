import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {NS} from '../server/ooxml.mjs';
import {analyzeMaterial,createMaterialAnalysisCache} from '../server/material-analysis.mjs';
import {selectPreparedMaterial} from '../server/material-preflight.mjs';

const template={width:12192000,height:6858000,safeArea:{x:.055,y:.16,w:.89,h:.76},theme:{primary:'004695'}};
const slide={title:'当前问题',kind:'content',visual:'parallel',bullets:['问题：缺少协同','措施：明确职责']};
const component=(id,bounds={x:0,y:0,w:240,h:100})=>({id,familyId:id,layout:true,scope:'full',purpose:'content',relation:'parallel',title:'并列关系',text:'',tags:[],nativeObjects:8,bounds,slots:[{index:0,key:'shape:1',maxChars:30,required:true}],width:1000,height:562.5});

test('选材时先拒绝主体过小的候选，只保留对象完整且占比合格的素材，不产生预检文案',async()=>{
 const candidates=[component('a',{x:0,y:0,w:100,h:800}),component('b')],used=new Set();
 const out=await selectPreparedMaterial(slide,candidates,{template,used,analyze:async c=>c});
 assert.equal(out.component.id,'b');assert.equal(out.diagnostics[0].status,'rejected');
 assert.ok(out.layout.layoutReview.materialUsage.area>=.45);assert.equal(out.layout.layoutReview.sourceObjects,out.layout.layoutReview.retainedObjects);
 assert.equal(out.layout.materialBindings,undefined);assert.equal(out.layout.blocks,undefined);assert.ok(used.has('b'));assert.equal(used.has('a'),false);
});

test('预检支持安全岛重排，所有原生对象必须保留',async()=>{
 const c=component('reflow',{x:0,y:0,w:100,h:500});
 c.geometry={reflowSafe:true,islands:[{nodeIndices:[0],keys:['1'],bounds:{x:0,y:0,w:100,h:80},nativeObjects:4},{nodeIndices:[1],keys:['2'],bounds:{x:0,y:420,w:100,h:80},nativeObjects:4}]};
 const out=await selectPreparedMaterial(slide,[c],{template,analyze:async c=>c});
 assert.equal(out.layout.layoutRecipe,'reflow');assert.equal(out.layout.layoutReview.retainedObjects,8);
 const broken=structuredClone(c);broken.geometry.islands[1].nativeObjects=3;
 const rejected=await selectPreparedMaterial(slide,[broken],{template,analyze:async c=>c});
 assert.equal(rejected.component,null);assert.match(rejected.diagnostics[0].reason,/对象遗漏/);
});

test('BNA正文按实际bodyArea预检，原生模板封面不浪费选材和写作槽位',async()=>{
 const bna={...template,bnaProfile:{coverPage:1,bodyArea:{x:.04,y:.205,w:.92,h:.74}}};
 const out=await selectPreparedMaterial(slide,[component('bna')],{template:bna,analyze:async c=>c});
 assert.ok(out.component);assert.ok(out.layout.layoutReview.materialUsage.area>=.45);
 const cover=await selectPreparedMaterial({...slide,kind:'cover'},[],{template:bna,analyze:()=>{throw Error('封面不应分析');}});
 assert.equal(cover.layout.nativeTemplateCover,true);assert.equal(cover.component,null);
});

test('BNA不接受虽然面积及格但仍明显偏窄或偏矮的素材',async()=>{
 const bna={...template,bnaProfile:{bodyArea:{x:.03,y:.19,w:.94,h:.755}}},out=await selectPreparedMaterial(slide,[component('a-narrow',{x:0,y:0,w:160,h:100}),component('b-filled',{x:0,y:0,w:220,h:100})],{template:bna,analyze:async c=>c});
 assert.equal(out.component.id,'b-filled');assert.match(out.diagnostics[0].reason,/纵横比/);assert.ok(out.diagnostics[0].usage.area>=.45);assert.deepEqual(out.layout.layoutReview.materialUsage,{width:1,height:1,area:1});
});

test('找不到同类结构时返回诊断，不擅自把真实流程替换成通用并列卡片',async()=>{
 const out=await selectPreparedMaterial({...slide,visual:'cycle'},[component('parallel')],{template,analyze:()=>{throw Error('不应进入不同结构分析');}});
 assert.equal(out.component,null);assert.equal(out.layout,null);
 const excluded=await selectPreparedMaterial(slide,[component('x')],{template,excludeIds:['x'],analyze:()=>{throw Error('不应分析已排除素材');}});
 assert.equal(excluded.component,null);
});

async function fixture(){
 const zip=new JSZip();
 const shape=id=>`<p:sp><p:nvSpPr><p:cNvPr id="${id}"/><p:cNvSpPr txBox="1"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${id*10000}" y="10000"/><a:ext cx="2000000" cy="800000"/></a:xfrm><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:rPr sz="1800"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:rPr><a:t>标题${id}</a:t></a:r></a:p></p:txBody></p:sp>`;
 zip.file('ppt/slides/slide1.xml',`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree>${shape(1)}${shape(2)}</p:spTree></p:cSld></p:sld>`);
 zip.file('ppt/theme/theme1.xml',`<a:theme xmlns:a="${NS.a}"><a:themeElements><a:clrScheme><a:accent1><a:srgbClr val="004695"/></a:accent1></a:clrScheme><a:fontScheme><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="微软雅黑"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`);
 return zip.generateAsync({type:'nodebuffer'});
}
const sourceComponent={id:'cached',sourceId:'source-a',part:'ppt/slides/slide1.xml',nodeIndices:[0],width:12192000,height:6858000};

test('并发素材分析共用同源读取和快照，返回独立副本且索引变化会失效',async()=>{
 const buffer=await fixture();let reads=0;
 const cache=createMaterialAnalysisCache({readSource:async()=>{reads++;return buffer;}});
 const [a,b]=await Promise.all([analyzeMaterial(sourceComponent,{cache}),analyzeMaterial(sourceComponent,{cache})]);
 assert.equal(reads,1);assert.deepEqual(a,b);assert.notEqual(a,b);
 a.slots[0].maxChars=999;assert.notEqual((await analyzeMaterial(sourceComponent,{cache})).slots[0].maxChars,999);
 const changed=await analyzeMaterial({...sourceComponent,nodeIndices:[1]},{cache});assert.equal(changed.slots[0].key,'shape:2');assert.equal(reads,1);
 await analyzeMaterial({...sourceComponent,sourceId:'source-b'},{cache});assert.equal(reads,2);
 assert.equal(b.slots[0].textColor,'004695');
});

test('失败的读取不永久污染缓存，源和快照都按容量淘汰',async()=>{
 const buffer=await fixture();let reads=0;
 const cache=createMaterialAnalysisCache({maxSources:1,maxSnapshots:1,readSource:async()=>{reads++;if(reads===1)throw Error('暂时读取失败');return buffer;}});
 await assert.rejects(analyzeMaterial(sourceComponent,{cache}),/暂时读取失败/);
 const retried=await analyzeMaterial(sourceComponent,{cache});assert.equal(retried.slots.length,1);assert.equal(reads,2);
 await analyzeMaterial({...sourceComponent,sourceId:'source-b'},{cache});assert.deepEqual(cache.stats(),{sources:1,snapshots:1});
 await analyzeMaterial(sourceComponent,{cache});assert.equal(reads,4);
});
