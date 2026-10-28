import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewContentRelevance,relevancePageContext,relevanceSignature,validContentReview,validateContentReviews} from '../server/content-relevance.mjs';
const slide=()=>({kind:'content',title:'技术论坛聚焦基础应用与智能创新',bullets:['2名青年骨干作专题分享'],materialId:'material',materialSnapshot:{slots:[{index:0,key:'shape:1',role:'label'},{index:1,key:'shape:2',role:'body'},{index:2,key:'shape:3',decorative:true}],pageTags:{structure:{modules:[{id:'m1',slotKeys:['shape:1','shape:2']}]}}},materialBindings:[{slot:0,key:'shape:1',text:'专题分享',contentIds:['u1']},{slot:1,key:'shape:2',text:'邀请2名青年骨干作专题分享',contentIds:['u1']} ]});
test('关联审校依据最终可见文字与真实要点，忽略素材示例和装饰标题',()=>{
 const context=relevancePageContext(slide(),3);assert.equal(context.slots.length,2);assert.equal(context.slots[0].text,'专题分享');assert.deepEqual(context.modules,[{id:'m1',slots:[0,1]}]);assert.equal(context.units[0],'2名青年骨干作专题分享');
});
test('修改正文、主题或素材使旧关联通过结果失效，字体修改不重复消耗模型',()=>{
 const s=slide();s.contentReview={status:'pass',signature:relevanceSignature(s)};assert.ok(validContentReview(s));s.materialBindings[0].style={fontSize:20};assert.ok(validContentReview(s));s.materialBindings[0].text='其他主题';assert.equal(validContentReview(s),false);
});
test('检查结果不接受未知槽位、重复页码或带问题的通过结论',()=>{
 const contexts=[relevancePageContext(slide(),1)],bad=validateContentReviews([{page:1,status:'pass',reason:'相关',issues:[{slots:[99],reason:'未知'}]}],contexts);assert.equal(bad.accepted.length,0);assert.ok(bad.errors.length);
 const good=validateContentReviews([{page:1,status:'replace-material',reason:'重复填充',issues:[{slots:[0,1],reason:'应使用单个模块'}],recommendedModuleCount:1}],contexts);assert.equal(good.accepted[0].recommendedModuleCount,1);
});
test('关联审校批量调用真实角色接口，缓存未变化页并保存可定位问题',async()=>{
 const plan={sourceText:'2名青年骨干作专题分享',slides:[slide(),slide()]};let calls=0;
 const runAgent=async args=>{calls++;assert.equal(args.role,'content-reviewer');const context=JSON.parse(args.message);const result=await args.onTool('ppt_submit_content_review',{pages:context.pages.map(p=>({page:p.page,status:p.page===1?'pass':'rewrite',reason:p.page===1?'主题与分享事实一致':'模块标题不准确',issues:p.page===1?[]:[{slots:[0],reason:'标题应概括专题分享'}]}))});assert.ok(args.completeWhen('ppt_submit_content_review',result));return {type:'complete'};};
 const r=await reviewContentRelevance(plan,{runAgent});assert.equal(r.passed,false);assert.equal(r.issues[0].page,2);assert.ok(validContentReview(plan.slides[0]));await reviewContentRelevance(plan,{runAgent});assert.equal(calls,2);
});
