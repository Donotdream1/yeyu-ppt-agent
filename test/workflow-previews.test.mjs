import test from 'node:test';
import assert from 'node:assert/strict';
import {previewablePages,previewFingerprint} from '../server/workflow-previews.mjs';
test('阶段预览仅包含已完成或已填充页，保留原页码及审查状态',()=>{
 const cp={progress:{completedPages:[1]},pageErrors:[[3,{}]],plan:{slides:[{title:'封面'},{title:'未填写'},{title:'待调整',materialSnapshot:{},materialBindings:[{text:'已有文案'}]}]}};
 assert.deepEqual(previewablePages(cp),[{page:1,title:'封面',needsReview:false},{page:3,title:'待调整',needsReview:true}]);
});
test('换版、文案和模板改变时阶段预览缓存失效，原文不进入缓存指纹',()=>{
 const cp={plan:{title:'汇报',sourceText:'原文',slides:[{title:'主题',materialBindings:[{text:'文字'}]}]}},pages=[{page:1}],key=previewFingerprint(cp,{width:100},pages);
 const changed=structuredClone(cp);changed.plan.slides[0].materialBindings[0].text='新文字';assert.notEqual(previewFingerprint(changed,{width:100},pages),key);
 assert.notEqual(previewFingerprint(cp,{width:200},pages),key);changed.plan.slides[0]=cp.plan.slides[0];changed.plan.sourceText='原文更新但画面没变';assert.equal(previewFingerprint(changed,{width:100},pages),key);
});
