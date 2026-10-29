import test from 'node:test';
import assert from 'node:assert/strict';
import {requestSchema} from '../server/planner.mjs';
import {preparationIssues,preparationKey} from '../src/lib/journey.js';
test('仅给主题也能开始初稿，来源明确标为提案，不把模板样例当真实数据',()=>{const v=requestSchema.parse({inputMode:'topic',topic:'数字化转型',document:''});assert.equal(v.sourceProvenance.kind,'topic-draft');assert.equal(v.sourceProvenance.verified,false);assert.match(v.document,/不编造数字/);assert.match(v.document,/数字化转型/);assert.throws(()=>requestSchema.parse({inputMode:'topic',topic:'',document:''}),/主题至少2字/);assert.throws(()=>requestSchema.parse({document:'短文'}),/至少 20 字/);});
test('主题模式与文档模式分别校验，切换模式使已有方案失效',()=>{const s={document:'科研答辩',templateId:'t',studio:{hasKey:true}};assert.equal(preparationIssues({...s,inputMode:'topic'}).length,0);assert.ok(preparationIssues(s).length);assert.notEqual(preparationKey({...s,inputMode:'topic'}),preparationKey({...s,inputMode:'document'}));});
