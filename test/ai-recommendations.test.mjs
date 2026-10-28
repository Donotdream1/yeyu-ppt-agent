import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendMaterialsWithAI} from '../server/ai-recommendations.mjs';
const slide={title:'协同流程',kind:'content',visual:'process',bullets:['梳理需求','联合验证','持续优化']};
const items=Array.from({length:20},(_,i)=>({id:'material-'+i,familyId:'family-'+i,sourceId:'source',page:i+1,title:'协同流程'+i,text:'流程设计',tags:['流程'],layout:true,scope:'full',purpose:'content',relation:'process',nativeObjects:15,bounds:{x:0,y:0,w:100,h:50},slots:[{index:0,role:'label',maxChars:20}]}));
const runner=async({message,onTool,tools})=>{const input=JSON.parse(message);await onTool(tools[0].name,{items:input.candidates.slice(0,input.requested).map(c=>({id:c.id,reason:'流程节点适合展示需求、验证与优化三个环节'}))});};
test('AI从真实标签候选选5页，下一轮排除已展示和整稿使用过的素材',async()=>{
 const a=await recommendMaterialsWithAI(slide,items,{runAgent:runner,usedMaterialIds:['material-0']});assert.equal(a.items.length,5);assert.ok(a.items.every(i=>i.id!=='material-0'&&i.match==='ai'));
 const b=await recommendMaterialsWithAI(slide,items,{runAgent:runner,usedMaterialIds:['material-0'],excludeIds:a.items.map(i=>i.id)});assert.equal(b.items.length,5);assert.ok(b.items.every(i=>!a.items.some(v=>v.id===i.id)));
});
test('不接受AI编造的素材ID或重复结果',async()=>{
 await assert.rejects(()=>recommendMaterialsWithAI(slide,items,{runAgent:async({onTool,tools})=>onTool(tools[0].name,{items:Array.from({length:5},()=>({id:'fake-id',reason:'推荐'}))})}),/真实候选/);
});
test('同页的不同组件不混入新一轮，素材不足时返回实际数量',async()=>{
 const a=await recommendMaterialsWithAI(slide,[...items.slice(0,3),{...items[0],id:'same-family'}],{excludeIds:['material-0'],runAgent:runner});assert.equal(a.items.length,2);assert.ok(a.items.every(i=>i.familyId!=='family-0'));
 const b=await recommendMaterialsWithAI(slide,items.slice(0,3),{excludeIds:items.slice(0,3).map(i=>i.id),runAgent:()=>assert.fail('没有候选时不应调用模型')});assert.equal(b.exhausted,true);assert.equal(b.items.length,0);
});
