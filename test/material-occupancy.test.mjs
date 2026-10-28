import test from 'node:test';
import assert from 'node:assert/strict';
import {composeHermesSlide} from '../server/page-layout.mjs';
import {autoMaterialSuitable} from '../server/material-layouts.mjs';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomicUpdateJson} from '../server/atomic-json.mjs';
import {applyMeasuredFonts} from '../server/native-text-fit.mjs';
import {openZip,parse,elements,NS} from '../server/ooxml.mjs';
const template={width:12192000,height:6858000,safeArea:{x:.055,y:.16,w:.89,h:.76},theme:{primary:'004695',text:'202020'},designPalette:{mode:'material',primary:'004695',colors:['004695']}};
const slide={title:'工作汇报',kind:'content',bullets:['任务：'+('工作内容'.repeat(18)),'成效：'+('依据记录'.repeat(18))],materialSnapshot:{id:'sample',bounds:{x:0,y:0,w:800,h:300},nativeObjects:8},materialBindings:[{slot:0,text:'任务及进展',contentIds:['u1']},{slot:1,text:'成效与依据',contentIds:['u2']}],adaptation:{status:'checked',coveredUnits:2,unitCount:2}};
test('长文案已进入素材时，自动布局使用全宽主体，不再触发31%叙述栏或重复底栏',()=>{
 const out=composeHermesSlide(slide,0,template),component=out.blocks.find(b=>b.type==='component');
 assert.equal(out.layoutRecipe,'visual');assert.equal(component.w,.89);assert.equal(out.blocks.filter(b=>b.type==='text').length,1);assert.equal(out.layoutReview.retainedObjects,8);
});

test('BNA主体适度扩展铺满标题以下区域，极端纵横比保留整体结构供换材',()=>{
 const target={...template,bnaProfile:{bodyArea:{x:.03,y:.19,w:.94,h:.755}}},out=composeHermesSlide({...slide,materialSnapshot:{...slide.materialSnapshot,bounds:{x:0,y:0,w:2200,h:1000}}},1,target),block=out.blocks.find(b=>b.type==='component');
 assert.equal(block.fitMode,'fill');assert.equal(block.y,.19);assert.equal(block.w,.94);assert.equal(block.h,.755);assert.deepEqual(out.layoutReview.materialUsage,{width:1,height:1,area:1});assert.equal(out.layoutReview.sourceObjects,out.layoutReview.retainedObjects);
 const narrow=composeHermesSlide({...slide,materialSnapshot:{...slide.materialSnapshot,bounds:{x:0,y:0,w:400,h:1000}}},1,target);assert.equal(narrow.blocks.find(b=>b.type==='component').fitMode,'contain');
});
test('旧计划中的叙述栏配方不能自动重现，用户明确要求后说明区才启用且占比按实际图框计算',()=>{
 const legacy=composeHermesSlide({...slide,layoutRecipe:'narrative-visual'},0,template);assert.equal(legacy.layoutRecipe,'visual');
 const explicit=composeHermesSlide({...slide,layoutRecipe:'narrative-visual',narrativeRequested:true},0,template),component=explicit.blocks.find(b=>b.type==='component');
 assert.equal(explicit.layoutRecipe,'narrative-visual');assert.ok(component.w/template.safeArea.w>.75);assert.ok(explicit.layoutReview.materialUsage.width<.8);assert.ok(explicit.layoutReview.materialUsage.area<1);
});
test('遗漏要点需要重新填充素材，不通过额外说明栏掩盖绑定遗漏',()=>{
 assert.throws(()=>composeHermesSlide({...slide,materialBindings:slide.materialBindings.slice(0,1)},0,template),/重新分配到素材/);
});
test('三方面问题不自动匹配68格甘特图，保留合理的标题与说明多槽结构',()=>{
 assert.equal(autoMaterialSuitable({title:'当前问题',visual:'matrix',bullets:['融合不足','口径不清','经验未沉淀']},{title:'甘特图：工作推进计划',slots:Array.from({length:68},()=>({}))}),false);
 assert.equal(autoMaterialSuitable({title:'模型与平台',visual:'architecture',bullets:['模型计算','平台部署']},{title:'架构图',slots:Array.from({length:16},()=>({}))}),true);
});
test('组合图形在PowerPoint中放缩后，字号修正按比例写回局部坐标，保留文字层级',async()=>{
 const zip=new JSZip();zip.file('ppt/presentation.xml',`<p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);zip.file('ppt/_rels/presentation.xml.rels',`<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${NS.r}/slide" Target="slides/slide1.xml"/></Relationships>`);zip.file('ppt/slides/slide1.xml',`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2"/></p:nvSpPr><p:txBody><a:p><a:r><a:rPr sz="2400"/><a:t>标题</a:t></a:r><a:r><a:rPr sz="1200"/><a:t>说明</a:t></a:r><a:r><a:t>继承字体的文字</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
 const output=await openZip(await applyMeasuredFonts(await zip.generateAsync({type:'nodebuffer'}),[{page:1,id:2,before:20,size:16}]));assert.deepEqual(elements(parse(await output.file('ppt/slides/slide1.xml').async('string')),'rPr').map(n=>n.getAttribute('sz')),['1920','960','1600']);
});
test('多个任务同时更新索引，不共享临时文件也不覆盖其他任务的变更',async()=>{
 const dir=path.resolve('test-output/atomic-'+randomUUID());await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'index.json');
 try{const results=await Promise.allSettled(Array.from({length:10},(_,i)=>atomicUpdateJson(file,{items:[]},async db=>{await new Promise(r=>setTimeout(r,2));db.items.push(i);})));assert.ok(results.every(r=>r.status==='fulfilled'),results.filter(r=>r.status==='rejected').map(r=>r.reason?.message).join(';'));const saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(new Set(saved.items).size,10);}finally{assert.match(path.relative(path.resolve('test-output'),dir),/^atomic-[a-f0-9-]{36}$/i);await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
