import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLayoutSkill,styleSkill,applyStyleSkill,updateStyleAnalysis} from '../server/style-market.mjs';
import {analyzeStyleSkill,startStyleAnalysis,validateLayoutPageAnalysis} from '../server/style-analysis.mjs';
import {dataDir} from '../server/library.mjs';
const refFile=path.join(dataDir,'system-layouts/research-defense.json'),installed=await fs.access(refFile).then(()=>true,()=>false);
const pagesResult=pages=>pages.map(p=>({page:p.page,purpose:p.kind,logic:'parallel',layoutDescription:'依据原生对象：标题在上，正文模块在下，保留源元素尺寸与关系。',modules:[{name:'信息模块',slotKeys:p.slots.filter(s=>!s.fixed).map(s=>s.key)}],slots:p.slots.map(s=>({key:s.key,role:s.fixed?'metadata':'body',description:'依据实际对象说明用途'})),reuseNotes:['不得复制示例数据']}));
test('逐页模型分析必须覆盖全部页码及全部原生文本槽，拒绝虚构对象',()=>{
 const ref=[{page:3,slots:[{key:'shape:2'},{key:'shape:3'}]}],valid=pagesResult(ref.map(p=>({...p,kind:'content'})));assert.equal(validateLayoutPageAnalysis(ref,valid).length,1);
 assert.throws(()=>validateLayoutPageAnalysis(ref,[]),/全部页面/);assert.throws(()=>validateLayoutPageAnalysis(ref,[{...valid[0],slots:valid[0].slots.slice(0,1)}]),/槽位/);assert.throws(()=>validateLayoutPageAnalysis(ref,[{...valid[0],slots:[{...valid[0].slots[0],key:'shape:999'},valid[0].slots[1]]}]),/未知或重复/);
});
test('完整PPT进入模型分批阅读，汇总规范进入真实生成上下文；失败不会伪装为可用', {skip:!installed},async()=>{
 const user='style-analysis-'+randomUUID(),ref=JSON.parse(await fs.readFile(refFile,'utf8'));
 try{const card=await createLayoutSkill(user,{name:'全量模型分析',content:'用户明确要求保留源色、源字号和全部结构，标题简明。'},{buffer:await fs.readFile(path.join(dataDir,'sources',ref.sourceId+'.pptx')),name:'研究模板.pptx'});const seen=[];
 const runAgent=async({tools,message,onTool,onMetrics})=>{const data=JSON.parse(message);if(tools[0].name==='ppt_read_layout_pages'){seen.push(...data.pages.map(p=>p.page));assert.ok(data.pages.every(p=>p.visualObjects.length>0));await onTool(tools[0].name,{pages:pagesResult(data.pages)});}else await onTool(tools[0].name,{styleName:'科研布局',summary:'全套使用原生层级与模块。',rules:['按来源字号分层','沿用源色与细边框','明确对比与循环关系']});onMetrics?.({modelRequests:1});};
 const complete=await analyzeStyleSkill(user,card.id,{runAgent});assert.deepEqual(seen,Array.from({length:12},(_,i)=>i+1));assert.equal(complete.modelAnalysis.completedPages,12);assert.equal(complete.modelAnalysis.metrics.length,4);assert.equal(complete.status,'ready');assert.ok(complete.nativeTemplate.pages.every(p=>p.slots.every(s=>s.semanticRole)));const applied=await applyStyleSkill(user,{styleSkillId:card.id});assert.match(applied.styleSkillSnapshot.content,/用户明确要求/);assert.match(applied.styleSkillSnapshot.content,/明确对比与循环关系/);
 await assert.rejects(analyzeStyleSkill(user,card.id,{runAgent:async()=>{throw Error('模型不可用');}}),/模型不可用/);const failed=await styleSkill(user,card.id);assert.equal(failed.status,'analysis_failed');assert.equal(failed.modelAnalysis.status,'failed');await assert.rejects(applyStyleSkill(user,{styleSkillId:card.id}),/审核/);
 await assert.rejects(updateStyleAnalysis(user,card.id,{status:'running'},'different-template'),/旧分析已停止/);
 }finally{await fs.rm(path.join(dataDir,'style-market',user),{recursive:true,force:true});}
});
test('没有API Key时分析进入可重试失败状态，而不是永久停留在排队', {skip:!installed},async()=>{
 const user='missing-key-'+randomUUID();try{const card=await createLayoutSkill(user,{baseId:'research-defense',name:'缺Key状态验收'});await startStyleAnalysis(user,card.id,{apiKey:''});let item;for(let i=0;i<50;i++){item=await styleSkill(user,card.id);if(item.status==='analysis_failed')break;await new Promise(r=>setTimeout(r,10));}assert.equal(item.status,'analysis_failed');assert.match(item.modelAnalysis.error,/API Key/);}finally{await fs.rm(path.join(dataDir,'style-market',user),{recursive:true,force:true});}
});

