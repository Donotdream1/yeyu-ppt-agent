import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePageEvidence,pageEvidence} from '../server/page-evidence.mjs';

test('中文改写标题仍能检索原文，数值与限定保持逐字引用',()=>{
 const document='本报告围绕企业质量设备协同工作展开。\n设备维护团队完成了关键机组的故障排查，停机时间由12小时降至8小时，统计周期为第三季度。\n本年度人才培养计划安排导师带教。';
 const evidence=pageEvidence(document,[{title:'关键设备协同维护成效',bullets:['停机时间变化与统计周期']}]);
 assert.ok(evidence.includes('停机时间由12小时降至8小时，统计周期为第三季度。'));
 for(const paragraph of evidence.split('\n'))assert.ok(document.includes(paragraph));
 assert.equal(pageEvidence(document,[{title:'quantum entanglement'}]),'');
});

test('检索先覆盖每个分配页面，按原文顺序输出，字数预算含换行',()=>{
 const a='设备故障协同维护，停机时间减少12小时。',b='人才培养师徒带教，岗位考核通过率90%。',read=preparePageEvidence(a+'\n'+b+'\n质量质量质量质量质量质量。');
 const output=read([{title:'设备维护'},{title:'人才培养'}],a.length+b.length+1);
 assert.equal(output,a+'\n'+b);assert.ok(output.length<=a.length+b.length+1);
 assert.equal(read([{title:'设备维护'}],0),'');
});

test('长段落按完整句子检索，不截断单位或挤掉短的关键事实',()=>{
 const noise='常规说明内容。'.repeat(270),fact='关键设备维护停机时间为8小时。',document=noise+fact;
 const evidence=pageEvidence(document,[{title:'设备维护',bullets:['停机时间']}],60);
 assert.equal(evidence,fact);
});
