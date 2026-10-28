import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePresentationRules,PRESENTATION_RULES_MARKER} from '../server/presentation-rules.mjs';
test('旧浏览器草稿不能覆盖新设计规则，保留用户原始提示并只替换生成尾部',()=>{
 const old=`用户自定：保留素材蓝金原色。\n${PRESENTATION_RULES_MARKER}\n旧版规则`,next=mergePresentationRules(old,'新规则：活动日期不重复，模块标题与正文关联。');
 assert.ok(next.startsWith('用户自定：保留素材蓝金原色。'));assert.ok(next.includes('活动日期不重复'));assert.equal(next.includes('旧版规则'),false);assert.equal(next.split(PRESENTATION_RULES_MARKER).length,2);assert.equal(mergePresentationRules(next,'新规则：活动日期不重复，模块标题与正文关联。'),next);
});
