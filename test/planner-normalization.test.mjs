import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeModelPlan,deckSchema,planDeck,requestSchema,AUTO_COMPOSITION_PROMPT} from '../server/planner.mjs';
import {prepareChart} from '../server/charts.mjs';

const quote='一月产量12吨';
const chart={code:'S01',title:'月产量',unit:'吨',grain:'每月一个产量',status:'blocked',records:[{x:'一月',value:12,sourceQuote:quote}]};
const raw=()=>({title:'模型响应兼容',slides:[{title:'封面',kind:'cover',bullets:[],visualKeywords:'架构，协同、职责'},{title:'数据口径',kind:'content',bullets:['产量：12吨'],visualKeywords:'["产量","月度对比"]',chart:{...chart,issues:'原文尚未说明产量的统计范围和统计时间，不能确认各类别是否使用一致的统计口径，需要先补充说明。'}}]});

test('复现用户错误：关键词和图表问题为字符串时，整个 DeepSeek 大纲可以解析',async()=>{
  const input=requestSchema.parse({document:quote+'。原文尚未说明完整的统计口径。',mode:'deepseek',apiKey:'test-only-key'}),reply=raw();let calls=0;
  const p=await planDeck(input,{fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}]})};}});
  assert.equal(calls,1,'仅格式规范化，不需重新调用模型');assert.deepEqual(p.slides[0].visualKeywords,['架构','协同','职责']);assert.deepEqual(p.slides[1].visualKeywords,['产量','月度对比']);
  assert.deepEqual(p.slides[1].chart.issues,[reply.slides[1].chart.issues]);assert.equal(p.slides[1].chart.status,'blocked');assert.equal(p.slides[1].chart.records[0].value,12);
  const prepared=prepareChart(p.slides[1].chart,input.document);assert.equal(prepared.status,'blocked');assert.ok(prepared.issues.includes(reply.slides[1].chart.issues));
});
test('空字符串和 null 列表被规范为空数组，blocked 图表不会因此变成 ready',()=>{
  const p=raw();p.slides[0].visualKeywords=null;p.slides[1].chart.issues='  ';const result=deckSchema.parse(normalizeModelPlan(p));assert.deepEqual(result.slides[0].visualKeywords,[]);assert.deepEqual(result.slides[1].chart.issues,[]);assert.equal(prepareChart(result.slides[1].chart,quote).status,'blocked');
});
test('长问题说明分段保留全部内容，换行与已有数组也可解析',()=>{
  const p=raw(),message='统计范围未明确。'.repeat(90)+'⚙️';p.slides[1].chart.issues=message;const out=deckSchema.parse(normalizeModelPlan(p));assert.equal(out.slides[1].chart.issues.join(''),message);assert.ok(out.slides[1].chart.issues.every(s=>s.length<=500));
  p.slides[1].chart.issues='缺少分母\n缺少范围';assert.deepEqual(normalizeModelPlan(p).slides[1].chart.issues,['缺少分母','缺少范围']);
  p.slides[1].chart.issues='["缺少分母","缺少范围"]';assert.deepEqual(normalizeModelPlan(p).slides[1].chart.issues,['缺少分母','缺少范围']);
});
test('合法列表保持语义，规范化不修改原始响应，不强制转换错误对象或超量列表',()=>{
  const p=raw();p.slides[0].visualKeywords=['架构','职责'];p.slides[1].chart.issues=['需核查范围'];const before=JSON.stringify(p);const out=normalizeModelPlan(p);assert.equal(JSON.stringify(p),before);assert.deepEqual(out.slides[1].chart.issues,['需核查范围']);
  p.slides[0].visualKeywords={关键词:'架构'};assert.equal(deckSchema.safeParse(normalizeModelPlan(p)).success,false);
  p.slides[0].visualKeywords=['架构'];p.slides[1].chart.issues=Array.from({length:31},(_,i)=>'问题'+i);assert.equal(deckSchema.safeParse(normalizeModelPlan(p)).success,false);
});
test('已编排图表同样规范问题列表，数据记录不被替换或删除',()=>{
  const p=raw();p.slides[1].blocks=[{id:'chart',type:'chart',x:.1,y:.2,w:.8,h:.6,chart:{...chart,issues:'待确认统计口径'}}];const out=deckSchema.parse(normalizeModelPlan(p));assert.deepEqual(out.slides[1].blocks[0].chart.issues,['待确认统计口径']);assert.equal(out.slides[1].blocks[0].chart.records[0].sourceQuote,quote);
});
