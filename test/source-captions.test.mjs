import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import {isSourceAuxiliaryCaption,sourceHeaderDecorationIds} from '../server/source-captions.mjs';
import {drawingNodes} from '../server/components.mjs';
import {analyzeMaterial,createMaterialAnalysisCache} from '../server/material-analysis.mjs';
import {validateAdaptation} from '../server/designer.mjs';
import {createHermesSession} from '../server/hermes-workflow.mjs';
import {composeDeck} from '../server/composition.mjs';
import {NS,openZip,slideOrder,parse,elements,first} from '../server/ooxml.mjs';

const position={x:.807,y:.048,w:.184,h:.081};
test('matching report heading at the top left is furniture, while real module headings remain',()=>{
 const slot={key:'shape:13',sample:'述职报告：工作中的个人成长',font:28,position:{x:.029,y:.036,w:.391,h:.076}},component={layout:true,scope:'full',title:'完整组合 · 工作中的个人成长'};
 assert.equal(isSourceAuxiliaryCaption(slot,component),true);
 assert.equal(isSourceAuxiliaryCaption({...slot,sample:'后续方向'},component),false);
 assert.equal(isSourceAuxiliaryCaption({...slot,position:{...slot.position,y:.3}},component),false);
 assert.equal(isSourceAuxiliaryCaption(slot,{...component,title:'三项工作举措'}),false);
 assert.equal(isSourceAuxiliaryCaption(slot,{...component,layout:false}),false);
 assert.equal(isSourceAuxiliaryCaption({...slot,table:{row:0,column:0}},component),false);
});
test('仅清已确认的源辅助页眉，正常右栏标题、表格、小图标文字和非白名单参考页不误清',()=>{
 assert.equal(isSourceAuxiliaryCaption({sample:'高端工作汇报PPTHigh end Work Report PPT',position},{}),true);
 assert.equal(isSourceAuxiliaryCaption({sample:'Powerpoint Template',position},{}),true);
 assert.equal(isSourceAuxiliaryCaption({sample:'实验组结果',position},{}),false);
 assert.equal(isSourceAuxiliaryCaption({sample:'Powerpoint Template 解析原理',position},{}),false);
 assert.equal(isSourceAuxiliaryCaption({sample:'Powerpoint Template',position:{...position,y:.3}},{}),false);
 assert.equal(isSourceAuxiliaryCaption({sample:'L2',position:{x:.765,y:.094,w:.042,h:.027}},{}),false);
 assert.equal(isSourceAuxiliaryCaption({sample:'Powerpoint Template',position,table:{row:0,column:0}},{}),false);
 assert.equal(isSourceAuxiliaryCaption({key:'shape:13',sample:'五大模型',position},{sourceId:'4ecc6a40eb3ee44a',page:5}),true);
 assert.equal(isSourceAuxiliaryCaption({key:'shape:99',sample:'五大模型',position},{sourceId:'4ecc6a40eb3ee44a',page:5}),false);
 assert.equal(isSourceAuxiliaryCaption({key:'shape:13',sample:'五大模型',position},{sourceId:'another-source',page:5}),false);
});

test('源标题下短装饰线须有已确认页眉才移除，正文图线仍保留',()=>{
 const width=12192000,height=6858000,bar=(id,y)=>`<p:sp><p:nvSpPr><p:cNvPr id="${id}"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="519202" y="${y}"/><a:ext cx="1080000" cy="45719"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr></p:sp>`,doc=parse(`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree>${bar(6,1034067)}${bar(7,2400000)}</p:spTree></p:cSld></p:sld>`),nodes=drawingNodes(doc),caption={key:'shape:9',sample:'Powerpoint Template',position};
 assert.deepEqual(sourceHeaderDecorationIds(nodes,{width,height},[caption]),['6','9']);assert.deepEqual(sourceHeaderDecorationIds(nodes,{width,height},[]),[]);
});

async function fixture(){
 const zip=new JSZip(),width=12192000,height=6858000;
 const shape=(id,name,p,text)=>`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(p.x*width)}" y="${Math.round(p.y*height)}"/><a:ext cx="${Math.round(p.w*width)}" cy="${Math.round(p.h*height)}"/></a:xfrm><a:solidFill><a:srgbClr val="164C78"/></a:solidFill></p:spPr>${text===undefined?'':`<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1800"/><a:t>${text}</a:t></a:r></a:p></p:txBody>`}</p:sp>`;
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
 zip.file('ppt/slides/slide1.xml',`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree>${shape(2,'正文',{x:.1,y:.3,w:.7,h:.4},'正文12项')}${shape(9,'辅助页眉',position,'Powerpoint Template')}${shape(14,'页眉图标',{x:.762,y:.049,w:.045,h:.08})}${shape(22,'图标内部文字',{x:.765,y:.094,w:.042,h:.027},'L2')}${shape(32,'正文图标',{x:.8,y:.45,w:.05,h:.08})}</p:spTree></p:cSld></p:sld>`);
 zip.file('ppt/presentation.xml',`<p:presentation xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`);
 const buffer=await zip.generateAsync({type:'nodebuffer'}),cache=createMaterialAnalysisCache({readSource:async()=>buffer});
 const c=await analyzeMaterial({id:'caption-fixture',sourceId:'fixture',sourceName:'素材',title:'原生结构',part:'ppt/slides/slide1.xml',page:1,nodeIndices:[0,1,2,3,4],width,height},{cache});
 return {buffer,c};
}

test('分析将确认的页眉与邻接图标标装饰，正文边界不包含装饰，正文图标保留',async()=>{
 const {c}=await fixture();
 assert.deepEqual(new Set(c.suppressedSourceIds),new Set(['9','14','22']));
 assert.equal(c.sourceNativeObjects,5);assert.equal(c.suppressedNativeObjects,3);assert.equal(c.nativeObjects,2);
 assert.ok(c.bounds.y/c.height>.29);assert.equal(c.geometry.sourceNodeCount,2);
 assert.deepEqual(c.slots.filter(s=>s.decorative).map(s=>s.key),['shape:9','shape:22']);
 assert.ok(c.slots.filter(s=>s.decorative).every(s=>s.required===false));assert.equal(c.slots[0].required,true);
});

test('装饰槽可以空白，但任何业务u仅在辅助页眉出现时仍拒绝通过',async()=>{
 const {c}=await fixture(),slide={title:'验证',bullets:['正文12项']};
 assert.deepEqual(validateAdaptation(slide,c,[{slot:0,text:'正文12项',contentIds:['u1']}]),[]);
 const invalid=validateAdaptation(slide,c,[{slot:0,text:'正文',contentIds:[]},{slot:1,text:'正文12项',contentIds:['u1']}]);
 assert.ok(invalid.some(e=>e.includes('u1')));assert.ok(invalid.some(e=>e.includes('12')));
});

test('commit及旧allocate/write都不让装饰承担u，后台自动清空装饰文字而不要求writer凑槽',async()=>{
 const {c}=await fixture(),session=await createHermesSession({document:'正文12项必须放在原生正文素材中，辅助页眉不承载业务内容。',mode:'deepseek',outlinePlan:{title:'验证',slides:[{title:'验证',kind:'content',visual:'parallel',bullets:['正文12项'],materialId:c.id,materialSnapshot:c}]}});
 for(const name of ['ppt-writing','material-use'])await session.handle('skill_loaded',{name});
 await assert.rejects(session.handle('ppt_allocate_pages',{pages:[{page:1,assignments:[{slot:1,contentIds:['u1']}]}]}),/分配不完整/);
 const commit=await session.handle('ppt_commit_pages',{pages:[{page:1,bindings:[{slot:0,text:'正文12项',contentIds:['u1']},{slot:1,text:'不应出现',contentIds:['u1']}]}]});
 assert.equal(commit.ok,true);assert.equal(session.plan.slides[0].materialBindings[1].text,'');assert.deepEqual(session.plan.slides[0].materialBindings[1].contentIds,[]);
 assert.equal(session.plan.slides[0].adaptation.requiredSlots,1);
 await session.handle('ppt_allocate_pages',{pages:[{page:1,assignments:[{slot:0,contentIds:['u1']}]}]});
 const old=await session.handle('ppt_write_pages',{pages:[{page:1,bindings:[{slot:0,text:'正文12项',contentIds:['u1']}]}]});assert.equal(old.ok,true);
 assert.ok(session.plan.slides[0].materialBindings.filter(b=>b.slot>0).every(b=>!b.text&&!b.contentIds.length));
});

test('组合删除确认装饰图标组而不动正文图标，保留正文原字号并审计授权删除数',async()=>{
 const {buffer,c}=await fixture(),templateBuffer=await fs.readFile(new URL('../server/base.pptx',import.meta.url));
 const template={id:'base',sourceId:'template',width:12192000,height:6858000,pages:[{}],theme:{font:'微软雅黑',primary:'164C78',text:'202020'},designPalette:{mode:'material'}};
 const block={id:'c1',type:'component',componentId:c.id,materialSnapshot:c,x:.04,y:.205,w:.92,h:.74,bindText:true,colorMode:'source',textBindings:[{slot:0,key:'shape:2',text:'正文12项',contentIds:['u1']}]};
 const out=await composeDeck({title:'验证',slides:[{title:'验证',kind:'content',bullets:['正文12项'],blocks:[block]}]},template,[],{loadSource:async id=>id==='template'?templateBuffer:buffer});
 const zip=await openZip(out.buffer),order=await slideOrder(zip),doc=parse(await zip.file(order.paths[0]).async('string'));
 const names=elements(doc,'cNvPr').map(n=>n.getAttribute('name'));assert.ok(names.includes('正文图标'));assert.equal(names.includes('页眉图标'),false);assert.equal(names.includes('图标内部文字'),false);assert.equal(names.includes('辅助页眉'),false);
 const body=elements(doc,'sp').find(n=>first(n,'cNvPr')?.getAttribute('name')==='正文');assert.equal(first(body,'rPr').getAttribute('sz'),'1800');
 assert.equal(out.audit[0].nativeObjectCount,2);assert.equal(out.audit[0].suppressedNativeObjects,3);assert.equal(out.audit[0].sourceNativeObjects,5);
});
