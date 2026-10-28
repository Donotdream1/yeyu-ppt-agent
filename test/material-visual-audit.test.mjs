import test from 'node:test';
import assert from 'node:assert/strict';
import {applyImageReview,normalizeImageReview,validateImageReviews} from '../server/material-visual-audit.mjs';
import {reviewedPageClassification} from '../server/material-tags.mjs';
const review={id:'page-1',name:'四项重点工作',observedText:['工作计划'],visualSummary:'中心主题周围四张卡片，每张有独立标题和正文，蓝白浅底，细箭头指向中心。',purpose:'举措方案',logic:'总分',moduleCount:4,centerCount:1,supportCount:4,layout:'中心环绕',balance:'等量模块',density:'中',visualStyle:'企业商务',colorNames:['蓝','白'],primaryColorNames:['蓝'],visualForms:['原生几何图形'],reportTasks:['工作计划'],businessTopics:[],capacityAssessment:'分区不一致需复测',notes:[],unresolved:['模块容量需重新映射'],confidence:'中'};
const vision={nativeVision:true,attachedImages:1,lastRequestImageCount:1,acceptedImages:1};
const card=()=>({id:'page-1',purpose:{main:'数据分析',secondary:[]},logic:{primary:'并列'},structure:{moduleCount:3,centerCount:0,modules:[{id:'m1'}]},capacity:{modules:[{id:'m1',bodyCapacity:{min:30,max:50}}],confidence:'中'},visual:{style:'旧标签',colorNames:['蓝'],primaryColors:[{hex:'3764BF'}],sourceFonts:['微软雅黑']},scenario:{},editing:{textEditable:true,dataEditable:false},reuse:{adjustments:[],generationReady:true,authorization:'待核查'},review:{status:'待视觉复核'}});
test('没有整批原图实际接受证据、漏页或错误ID时不能标记完成',()=>{
 assert.throws(()=>validateImageReviews([review],[{id:'page-1'}],{...vision,nativeVision:false}),/视觉证据/);
 assert.throws(()=>validateImageReviews([review],[{id:'page-1'},{id:'page-2'}],vision),/视觉证据/);
 assert.throws(()=>validateImageReviews([],[{id:'page-1'}],vision),/实际仅复核0张/);
 assert.throws(()=>validateImageReviews([{...review,id:'wrong'}],[{id:'page-1'}],vision),/ID/);
 assert.deepEqual(validateImageReviews([review],[{id:'page-1'}],vision),[review]);
});
test('视觉模块变化时不把旧分组字数冒充新容量，不改原色RGB和原生编辑能力',()=>{
 const original=card(),next=applyImageReview(original,review,{model:'DeepSeek',runId:'run',auditId:'audit',imageSha256:'a'.repeat(64),vision});
 assert.equal(next.structure.moduleCount,4);assert.equal(next.capacity.modules.length,4);assert.ok(next.capacity.modules.every(m=>m.bodyCapacity.max===0));assert.equal(next.capacity.confidence,'低');
 assert.equal(next.review.status,'已视觉复核');assert.equal(next.review.visualAudit.vision.nativeVision,true);assert.deepEqual(next.visual.primaryColors,original.visual.primaryColors);assert.deepEqual(next.editing,original.editing);assert.equal(original.purpose.main,'数据分析');
 const confirmed=card();confirmed.review.status='已人工复核';assert.equal(applyImageReview(confirmed,review,{vision}).purpose.main,'数据分析');
});
test('中心计数口径和颜色检索别名可规范化，不增加或删减实际支撑点',()=>{
 const value=normalizeImageReview({...review,moduleCount:5,colorNames:['深蓝','粉红','香槟金'],primaryColorNames:['蓝白'],businessTopics:['通用','质量管理']});
 assert.equal(value.moduleCount,4);assert.equal(value.supportCount,4);assert.deepEqual(value.colorNames,['蓝','红','金']);assert.deepEqual(value.businessTopics,['质量管理']);
});
test('复核后的用途与逻辑进入实际选材，目录不会继续按旧正文分类',()=>{
 const p=card();p.review.status='已视觉复核';p.purpose.main='目录';p.logic.primary='并列';
 assert.deepEqual(reviewedPageClassification(p,{purpose:'content',relation:'parallel'}),{purpose:'agenda',relation:'agenda'});
 p.purpose.main='总结计划';p.logic.primary='时间';assert.equal(reviewedPageClassification(p,{relation:'parallel'}).relation,'timeline');
 p.review.status='待视觉复核';assert.deepEqual(reviewedPageClassification(p,{purpose:'content',relation:'parallel'}),{purpose:'content',relation:'parallel'});
});
