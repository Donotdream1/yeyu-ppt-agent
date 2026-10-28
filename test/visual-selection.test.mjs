import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {imageVisualFeatures,prepareVisualCandidates,createVisualContactSheet,validateVisualChoices,visualGeometry,intendedModuleCount,bodyColumnCount,selectVisualPages} from '../server/visual-selection.mjs';

test('选版模块数使用规划标签，十二项不误判为二项，正文数字不决定版式',()=>{
 assert.equal(intendedModuleCount({title:'任务安排',materialRequest:{moduleCount:12}}),12);
 assert.equal(intendedModuleCount({title:'十二项任务',bullets:['目标']}),12);
 assert.equal(intendedModuleCount({title:'设备改善',bullets:['完成12项检查']}),null);
 assert.equal(intendedModuleCount({title:'五大核心模型',materialRequest:{moduleCount:1,moduleCountExplicit:false}}),5);
 assert.equal(intendedModuleCount({title:'为何摆在第一条',bullets:['总体要求']}),null);
});
import {slideSchema} from '../server/planner.mjs';

const candidate=(id,sourceId)=>({component:{id,sourceId,sourceName:sourceId+'.pptx',page:3,bounds:{w:240,h:100},slots:[{index:0,role:'label',font:16,position:{x:.1,y:.2,w:.3,h:.2}}],structure:{groups:1,arrows:['rightArrow'],connectors:[]}},layout:{layoutRecipe:'visual',layoutReview:{materialUsage:{area:.8}}}});

test('12页视觉选版兼容旧版二参数完成回调，保留真实图片确认',async()=>{
 const pages=Array.from({length:12},(_,i)=>({page:i+1,slide:{title:'本页职责',bullets:['具体职责'],visual:'parallel'},candidates:[candidate('material-'+i,'source')]}));
 const selected=[],result=await selectVisualPages(pages,{checkpointId:'regression-two-args',ensurePreviews:async()=>{},createContactSheet:async batch=>{for(const page of batch)for(const c of page.candidates)c.previewAvailable=true;return 'test-contact.png';},runAgent:async options=>{
  assert.equal(options.images.length,1);options.onVision({nativeVision:true,acceptedImages:1});
  const payload=JSON.parse(options.message),args={pages:payload.pages.map(p=>({page:p.page,materialId:p.candidates[0].materialId,reason:'使用真实候选的并列模块',copyGuidance:'保留原字号，填入职责'}))};
  const response=await options.onTool('ppt_commit_visual_choices',args);assert.equal(options.completeWhen('ppt_commit_visual_choices',response),true);return {};
 },onSelection:async n=>selected.push(n)});
 assert.deepEqual(result.failures,[]);assert.equal(result.choices.size,12);assert.equal(selected.length,12);assert.ok([...result.choices.values()].every(c=>c.metadata.mode==='image-understanding'&&c.metadata.visionEvidence.nativeVision));
});

test('缺少视觉状态不会抛空值错误，也不能假称模型已看图',async()=>{
 const pages=[{page:1,slide:{title:'职责',bullets:['职责']},candidates:[candidate('a','s')]}];
 for(const evidenceSource of ['none','callback-state']){
  const result=await selectVisualPages(pages,{checkpointId:'regression-vision-state',ensurePreviews:async()=>{},createContactSheet:async batch=>{for(const page of batch)for(const c of page.candidates)c.previewAvailable=true;return 'test-contact.png';},runAgent:async options=>{
   const response=await options.onTool('ppt_commit_visual_choices',{pages:[{page:1,materialId:'a',reason:'并列职责',copyGuidance:'名称与说明分开填入'}]});
   const state=evidenceSource==='callback-state'?{vision:{nativeVision:true,acceptedImages:1}}:undefined;
   assert.equal(options.completeWhen('ppt_commit_visual_choices',response,state),evidenceSource!=='none');return undefined;
  }});
  assert.deepEqual(result.failures,[]);assert.equal(result.choices.get(1).metadata.mode,evidenceSource==='none'?'geometry-only':'image-understanding');
 }
});
test('视觉候选优先来自指定素材系列，不足时才跨系列，并保持原pt字号特征',async()=>{
 const components=[candidate('a','chosen').component,candidate('b','chosen').component,candidate('c','other').component],calls=[];
 const select=async(s,items,options)=>{calls.push(items.map(c=>c.sourceId));const c=items.find(c=>!options.excludeIds.includes(c.id));return c?candidate(c.id,c.sourceId):{component:null};};
 const list=await prepareVisualCandidates({},components,{template:{},preferredSourceId:'chosen',limit:3,select});
 assert.deepEqual(list.map(c=>c.component.id),['a','b','c']);assert.deepEqual(calls[0],['chosen','chosen']);assert.deepEqual(list[0].features.sourceFontSizes,[16]);assert.equal(list[0].features.textColumns,1);
});
test('联系表由真实候选预览组成，图像缺失明确记录，图像像素特征可复查',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'ppt-visual-'));
 try{const input=await sharp({create:{width:100,height:100,channels:3,background:'#FFFFFF'}}).composite([{input:await sharp({create:{width:50,height:50,channels:3,background:'#004695'}}).png().toBuffer(),left:25,top:25}]).png().toBuffer(),p={page:2,candidates:[candidate('a','s'),candidate('b','s')]};
  const file=await createVisualContactSheet([p],folder,{preview:async c=>{if(c.id==='b')throw Error('no preview');return input;}}),meta=await sharp(file).metadata();
  assert.equal(meta.width,960);assert.equal(meta.height,320);assert.equal(p.candidates[0].previewAvailable,true);assert.equal(p.candidates[1].previewAvailable,false);
  const features=await imageVisualFeatures(input);assert.ok(features.whiteSpaceRatio>.7&&features.whiteSpaceRatio<.8);assert.ok(features.inkBounds.w>.4&&features.inkBounds.w<.6);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('视觉角色不能选择另一页候选，选择理由与文案安排必须明确',()=>{
 const pages=[{page:2,candidates:[candidate('a','s')]},{page:3,candidates:[candidate('b','s')]}];
 const bad=validateVisualChoices([{page:2,materialId:'b',reason:'test',copyGuidance:'test'},{page:3,materialId:'b',reason:''}],pages);
 assert.equal(bad.accepted.length,0);assert.equal(bad.errors.length,2);
 const good=validateVisualChoices([{page:2,materialId:'a',reason:'五个并列模块承载五类职责',copyGuidance:'名称用标签，职责写入下方正文，保持原16pt'}],pages);
 assert.equal(good.accepted.length,1);
});
test('视觉选材来源和真实视觉模式可跨页面schema保留，不改变素材字号',()=>{
 const source={title:'模型',bullets:['模型职责'],visualSelection:{mode:'image-understanding',selectedMaterialId:'a',fontPolicy:{size:'source',autoShrink:false}}};
 const slide=slideSchema.parse(source);assert.equal(slide.visualSelection.mode,'image-understanding');assert.equal(slide.visualSelection.fontPolicy.autoShrink,false);assert.deepEqual(visualGeometry(candidate('a','s').component).sourceFontSizes,[16]);
});
test('五大模型的粗流程标签不会排除五列并列构图，候选保留两种视觉解释',async()=>{
 const five=candidate('five','s').component;five.slots=Array.from({length:5},(_,i)=>({index:i,role:'body',font:12,position:{x:.1+i*.15,y:.4,w:.12,h:.2}}));
 const process={...candidate('flow','s').component,relation:'process'},slide={title:'五大核心模型协同联动',visual:'process',bullets:['模型分工']},calls=[];
 const select=async(s,items,o)=>{calls.push(s.visual);const c=items.find(c=>!o.excludeIds.includes(c.id)&&((s.visual==='parallel')===(c.id==='five')));return c?{...candidate(c.id,'s'),component:c}:{component:null};};
 const list=await prepareVisualCandidates(slide,[five,process],{template:{},preferredSourceId:'s',limit:2,select});
 assert.equal(intendedModuleCount(slide),5);assert.equal(bodyColumnCount(five),5);assert.deepEqual(list.map(c=>c.component.id),['five','flow']);assert.ok(calls.includes('parallel'));assert.ok(calls.includes('process'));
});
