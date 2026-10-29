import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createDeck} from '../server/ooxml.mjs';
import {builtinAssets,dataDir} from '../server/library.mjs';
import {createLayoutSkill} from '../server/style-market.mjs';
import {analyzeStyleSkill} from '../server/style-analysis.mjs';
test('style analysis associates real preview order with pages and never marks a missing image visually verified',async()=>{
 const user='visual-evidence-'+randomUUID();
 try{
  const buffer=(await createDeck([{kind:'cover',title:'主题',bullets:[],assetId:'builtin-cover'},{kind:'content',title:'执行',bullets:['计划'],assetId:'builtin-content'}],builtinAssets,()=>{})).buffer;
  const card=await createLayoutSkill(user,{name:'视觉证据测试',content:'保留参考PPT所有原色、原字号和结构，按实际槽位填充。'},{buffer,name:'合成模板.pptx'}),seen=[];
  const runAgent=async({message,images,tools,onVision,onTool})=>{const m=JSON.parse(message);if(tools[0].name==='ppt_read_layout_pages'){seen.push({assigned:m.assignedPages,images,order:m.imagePageOrder});onVision({nativeVision:true});await onTool(tools[0].name,{pages:m.pages.map(p=>({page:p.page,purpose:p.kind,logic:'parallel',layoutDescription:'源标题和正文模块保持原有位置。',modules:[{name:'内容',slotKeys:p.slots.map(s=>s.key)}],slots:p.slots.map(s=>({key:s.key,role:'body',description:'源文本位置'})),reuseNotes:['不复制模板示例事实']}))});}else await onTool(tools[0].name,{styleName:'合成版式',summary:'源结构与字体层级。',rules:['保留源色','保留源字号','按模块组织文案']});};
  const partial=await analyzeStyleSkill(user,card.id,{runAgent,loadPreviews:async()=>[{page:1,file:'fixture-one.png'}]});assert.equal(partial.modelAnalysis.visualVerification,'structural-only');assert.equal(partial.modelAnalysis.pages[0].visualRead,true);assert.equal(partial.modelAnalysis.pages[1].visualRead,false);assert.deepEqual(seen[0].order,[1]);
  const complete=await analyzeStyleSkill(user,card.id,{runAgent,loadPreviews:async()=>[{page:1,file:'fixture-one.png'},{page:2,file:'fixture-two.png'}]});assert.equal(complete.modelAnalysis.visualVerification,'verified');assert.deepEqual(seen.at(-1).assigned,[2]);assert.deepEqual(seen.at(-1).images,['fixture-two.png']);
 }finally{await fs.rm(path.join(dataDir,'style-market',user),{recursive:true,force:true});}
});
