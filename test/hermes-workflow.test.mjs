import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,elements,first} from '../server/ooxml.mjs';
import {inspectGeometry,visibleNodeBounds} from '../server/material-geometry.mjs';
import {preserveIconAspect} from '../server/native-reflow.mjs';
import {harmonizeNative,harmonizedText,designSystem,customGeometryContains} from '../server/design-system.mjs';
import {createHermesSession} from '../server/hermes-workflow.mjs';
import {readComponents} from '../server/components.mjs';

const ns='xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const shape=(id,x,y,w,h,body='')=>`<p:sp><p:nvSpPr><p:cNvPr id="${id}"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="ellipse"/><a:solidFill><a:srgbClr val="F0A230"/></a:solidFill></p:spPr>${body}</p:sp>`;
test('按真实子元素计算可见边界，不让空的大组合边界缩小整页素材',()=>{
 const d=parse(`<p:grpSp ${ns}><p:nvGrpSpPr><p:cNvPr id="1"/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5000" cy="5000"/><a:chOff x="0" y="0"/><a:chExt cx="5000" cy="5000"/></a:xfrm></p:grpSpPr>${shape(2,100,200,300,400)}</p:grpSp>`);
 const g=inspectGeometry([d.documentElement],{width:5000,height:5000,bounds:{x:0,y:0,w:5000,h:5000},nodeIndices:[0]});assert.equal(g.bounds.w,300);assert.equal(g.bounds.h,400);assert.equal(g.sourceNativeObjects,2);
});

test('90度旋转的细长形状按实际横向边界放置，不误算成高竖条',()=>{
 const xml=shape(2,490,100,20,800).replace('<a:xfrm>','<a:xfrm rot="5400000">'),doc=parse(`<p:grpSp ${ns}><p:nvGrpSpPr><p:cNvPr id="1"/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="2000" cy="2000"/><a:chOff x="0" y="0"/><a:chExt cx="1000" cy="1000"/></a:xfrm></p:grpSpPr>${xml}</p:grpSp>`),b=visibleNodeBounds(doc.documentElement);
 assert.ok(Math.abs(b.w-1600)<.001);assert.ok(Math.abs(b.h-40)<.001);assert.ok(Math.abs(b.x-300)<.001);assert.ok(Math.abs(b.y-1180)<.001);
});
test('扩展画布时，圆形图标保持比例、中心和原生形状数量',()=>{
 const d=parse(`<p:grpSp ${ns}>${shape(2,100,200,300,300)}</p:grpSp>`);preserveIconAspect(d.documentElement,1.3,1);
 const ext=first(d,'ext'),off=first(d,'off');assert.ok(Math.abs(+ext.getAttribute('cx')*1.3-+ext.getAttribute('cy'))<1);assert.ok(Math.abs((+off.getAttribute('x')+(+ext.getAttribute('cx'))/2)-250)<1);assert.equal(elements(d,'sp').length,1);
});
test('原生图形与文字按用户模板协调配色，深底上的文字保留足够对比',()=>{
 const d=parse(`<p:grpSp ${ns}>${shape(2,0,0,500,500,'<p:txBody><a:p><a:r><a:rPr/><a:t>内容</a:t></a:r></a:p></p:txBody>')}</p:grpSp>`),template={theme:{primary:'333399',background:'FFFFFF'}},style=harmonizeNative(d.documentElement,template),s=elements(d,'sp')[0];const color=harmonizedText(s,d.documentElement,template);assert.notEqual(elements(d,'srgbClr')[0].getAttribute('val'),'F0A230');assert.equal(color,'FFFFFF');assert.equal(style.font,'微软雅黑');assert.equal(designSystem(template).primary,'333399');
});
test('Hermes 工具强制先加载技能、分析和分配，局部文案修正保留其他位置',async()=>{
 const session=await createHermesSession({document:'目标是将用户文档内容填写到可编辑素材中，并完整保留原生图形。',mode:'deepseek'});
 await assert.rejects(()=>session.handle('ppt_submit_outline',{plan:{title:'测试',slides:[{title:'目标',kind:'content',visual:'parallel',bullets:['目标：保留原生组件']}]}}),/加载/);
 for(const name of ['ppt-writing','material-use','layout-review','presentation-style'])await session.handle('skill_loaded',{name});
 await session.handle('ppt_classify_document',{family:'technical',rationale:'文档说明原生组件制作流程',evidence:['目标是将用户文档内容填写到可编辑素材中'],paletteMood:'blue'});
 await session.handle('ppt_submit_outline',{plan:{title:'测试',slides:[{title:'目标',kind:'content',visual:'parallel',bullets:['目标：保留原生组件']}]}});
 const catalog=await readComponents(),c=catalog.items.find(c=>c.layout&&c.purpose==='content'&&!c.dataRisk&&c.slots.length>=3&&c.slots.length<12);
 const result=await session.handle('ppt_analyze_materials',{selections:[{page:1,materialId:c.id}]}),slots=result.pages[0].slots;
 await session.handle('ppt_allocate_pages',{pages:[{page:1,assignments:slots.filter(s=>!s.fixed).map(s=>({slot:s.index,contentIds:['u1']}))}]});
 const bad=slots.find(s=>!s.fixed),bindings=slots.map(s=>({slot:s.index,text:s.fixed||(s.index===bad.index?'字'.repeat(s.maxChars+1):'说明'),contentIds:s.fixed?[]:['u1']}));
 const rejected=await session.handle('ppt_write_pages',{pages:[{page:1,bindings}]});assert.equal(rejected.ok,false);
 const fixed=await session.handle('ppt_write_pages',{pages:[{page:1,bindings:[{slot:bad.index,text:'更正',contentIds:['u1']}]}]});assert.equal(fixed.ok,true);assert.equal(session.plan.slides[0].materialBindings.length,slots.length);
 await assert.rejects(()=>session.handle('ppt_publish'),/先通过/);
 const review=await session.handle('ppt_review_layout');assert.equal(review.pages[0].sourceObjects,review.pages[0].retainedObjects);
});


test('镂空原生图形的中心不按外圈填充色判断文字背景',()=>{
 const path='<a:path w="100" h="100"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="0"/></a:lnTo><a:lnTo><a:pt x="100" y="100"/></a:lnTo><a:lnTo><a:pt x="0" y="100"/></a:lnTo><a:close/><a:moveTo><a:pt x="20" y="20"/></a:moveTo><a:lnTo><a:pt x="20" y="80"/></a:lnTo><a:lnTo><a:pt x="80" y="80"/></a:lnTo><a:lnTo><a:pt x="80" y="20"/></a:lnTo><a:close/></a:path>';
 const d=parse('<p:sp '+ns+'><p:spPr><a:custGeom><a:pathLst>'+path+'</a:pathLst></a:custGeom></p:spPr></p:sp>');
 assert.equal(customGeometryContains(d.documentElement),false);assert.equal(customGeometryContains(d.documentElement,.1,.1),true);
});
