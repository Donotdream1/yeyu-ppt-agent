import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {capacityRange,characterCounts,inferPurpose,inferLogic,inferModules,parseMaterialQuery,slideTagRequirements,matchPageTags} from '../server/material-tags.mjs';
import {readMaterialTags} from '../server/material-tag-store.mjs';
import {rankMaterialLayouts} from '../server/material-layouts.mjs';

const slot=(key,{x=.1,y=.25,w=.25,h=.2,font=14,sample='简短原文',role='body',...rest}={})=>({key,role,sample,font,fontSizesPt:[font],position:{x,y,w,h,wPt:w*960,hPt:h*540},...rest});
const card=overrides=>({
 id:'fixture',purpose:{main:'成果展示',secondary:[]},logic:{primary:'并列',secondary:[]},
 structure:{moduleCount:4,centerCount:0,supportCount:0},
 capacity:{modules:Array.from({length:4},(_,i)=>({id:'m'+i,bodyCapacity:{min:30,max:70}})),confidence:'中'},
 scenario:{businessTopics:['质量管理']},visual:{colorNames:['蓝']},
 editing:{textEditable:true,graphicsEditable:true,imageContentEditable:false,imageObjects:0},
 reuse:{generationReady:true,adjustments:[],authorization:'待核查'},
 review:{status:'已人工复核',method:'user-confirmed-preview',reviewedAt:'2026-10-27T00:00:00.000Z'},...overrides,
});

test('自然语言四项质量改善成果、每项40字、蓝色、可编辑应转成独立筛选条件',()=>{
 const request=parseMaterialQuery('四项质量改善成果，每项40字左右，蓝色，可编辑');
 assert.equal(request.moduleCount,4);assert.equal(request.perModuleChars,40);assert.equal(request.purpose,'成果展示');
 assert.ok(request.businessTopics.includes('质量管理'));assert.ok(request.colors.includes('蓝'));assert.equal(request.editable,true);
 assert.notEqual(parseMaterialQuery('原图不可编辑，不要求可编辑').editable,true);
});

test('页面明确声明的素材要求不会被查询中缺失字段清空，业务场景可以独立适配',()=>{
 const request=slideTagRequirements({title:'质量改善工作',kind:'content',visual:'parallel',bullets:['第一项','第二项'],materialRequest:{purpose:'成果展示',moduleCount:4,perModuleChars:40,colors:['蓝'],editable:true}},'');
 assert.equal(request.purpose,'成果展示');assert.equal(request.moduleCount,4);assert.equal(request.perModuleChars,40);
 assert.deepEqual(request.colors,['蓝']);assert.equal(request.editable,true);
});

test('序号不是内容项数，组合配色和二十项能分别识别',()=>{
 assert.equal(parseMaterialQuery('现代化产业体系为何摆在第一条').moduleCount,undefined);
 assert.equal(parseMaterialQuery('第四项工作分为三项举措').moduleCount,3);
 assert.equal(parseMaterialQuery('二十项任务').moduleCount,20);
 assert.deepEqual(parseMaterialQuery('整体色彩以红蓝金为主').colors,['红','蓝','金']);
 assert.deepEqual(parseMaterialQuery('保持素材原配色').colors,[]);
});

test('逐页逻辑标签匹配时不被旧版粗分类提前排除',()=>{
 const c={id:'tagged-flow',title:'流程步骤',text:'',tags:[],layout:true,relation:'parallel',purpose:'content',nativeObjects:12,slots:Array.from({length:8},(_,index)=>({index,role:'body'})),pageTags:card({logic:{primary:'流程',secondary:[]}})};
 const ranked=rankMaterialLayouts({title:'整改路径',kind:'content',visual:'process',bullets:['排查','整改','复核','归档'],materialRequest:{logic:'流程',moduleCount:4}},[c]);
 assert.equal(ranked[0].component.id,c.id);assert.ok(ranked[0].tagMatch.reasons.includes('逻辑：流程'));
});

test('建议容量来自文字框与真实字号，同样几何不会因原页字数不同而改变',()=>{
 const short=slot('s',{sample:'短句'}),long=slot('l',{sample:'原页长文本'.repeat(100)});
 assert.deepEqual(capacityRange(short),capacityRange(long));
 const more=capacityRange(slot('bigger',{w:.4,h:.3})),less=capacityRange(slot('smaller',{w:.15,h:.1}));
 assert.ok(more.max>less.max);assert.ok(capacityRange(slot('small-font',{font:14})).max>capacityRange(slot('large-font',{font:24})).max);
 assert.ok(capacityRange(short).min>0);assert.ok(capacityRange(short).min<=capacityRange(short).max);
 assert.equal(characterCounts('中文 AB CD').characters,6);assert.equal(characterCounts('中文 AB CD').englishWords,2);
});

test('未确认几何或源字号时不凭默认18pt宣称中置信容量',()=>{
 const noGeometry=capacityRange({font:18,sample:'实际写了100字'});assert.equal(noGeometry.confidence,'低');assert.equal(noGeometry.max,0);
 const noFont=capacityRange({position:{wPt:240,hPt:100},sample:'很长'.repeat(100)});
 assert.equal(noFont.confidence,'低');assert.equal(noFont.max,0);
 const explicitlyUnresolved=capacityRange({...slot('unresolved'),fontResolved:false});assert.equal(explicitlyUnresolved.confidence,'低');assert.equal(explicitlyUnresolved.max,0);
});

test('一级模块不计主标题、固定编号、页脚与装饰，每个主辅模块有自己的容量',()=>{
 const items=[slot('main',{x:.05,y:.3,w:.42,h:.32,sample:'主模块'}),slot('a',{x:.55,y:.25,w:.25,h:.12,sample:'小框里原文很长'.repeat(40)}),slot('b',{x:.55,y:.45,w:.25,h:.12}),slot('c',{x:.55,y:.65,w:.25,h:.12}),
  slot('page-title',{x:.05,y:.04,w:.8,h:.1}),slot('decoration',{x:.35,y:.5,w:.2,h:.2,decorative:true}),slot('number',{fixed:'01',x:.4,y:.4,w:.15,h:.1}),slot('footer',{y:.95,w:.2,h:.03})];
 const result=inferModules(items,{widthPt:960,heightPt:540});
 assert.equal(result.moduleCount,4);assert.equal(result.balance,'主次模块');assert.equal(result.modules.length,4);
 const main=result.modules.find(m=>m.slotKeys.includes('main')),small=result.modules.find(m=>m.slotKeys.includes('a'));
 assert.ok(main.bodyCapacity.max>small.bodyCapacity.max);assert.ok(small.originalBody.characters>small.bodyCapacity.max);
 assert.ok(result.modules.every(m=>!m.slotKeys.some(k=>['page-title','decoration','number','footer'].includes(k))));
});

test('一中心四支撑分别计数，不把中心当第五个并列支撑模块',()=>{
 const modules=[slot('center',{x:.4,y:.4,w:.2,h:.16,font:24}),slot('left-top',{x:.1,y:.25,w:.2,h:.15}),slot('right-top',{x:.7,y:.25,w:.2,h:.15}),slot('left-bottom',{x:.1,y:.65,w:.2,h:.15}),slot('right-bottom',{x:.7,y:.65,w:.2,h:.15})];
 const result=inferModules(modules,{widthPt:960,heightPt:540});
 assert.equal(result.centerCount,1);assert.equal(result.supportCount,4);assert.equal(result.moduleCount,4);assert.equal(result.totalRegions,5);
 assert.equal(result.layout,'中心环绕');assert.ok(result.modules.every(m=>!m.slotKeys.includes('center')));
 assert.ok(result.center.slotKeys.includes('center'));assert.ok(result.center.bodyCapacity.max>0);assert.ok(result.center.bodyCapacity.max<result.modules[0].bodyCapacity.max);
});

test('中心只有短标签、四周为正文模块时也应识别一中心四支撑，并单列中心标题容量',()=>{
 const modules=[slot('center-label',{x:.4,y:.4,w:.2,h:.16,font:24,role:'label',sample:'总目标'}),slot('left-top',{x:.1,y:.25,w:.2,h:.15}),slot('right-top',{x:.7,y:.25,w:.2,h:.15}),slot('left-bottom',{x:.1,y:.65,w:.2,h:.15}),slot('right-bottom',{x:.7,y:.65,w:.2,h:.15})];
 const result=inferModules(modules,{widthPt:960,heightPt:540});
 assert.equal(result.centerCount,1);assert.equal(result.supportCount,4);assert.equal(result.moduleCount,4);assert.equal(result.totalRegions,5);
 assert.ok(result.center.slotKeys.includes('center-label'));assert.ok(result.center.titleCapacity.max>0);
 assert.ok(result.modules.every(m=>!m.slotKeys.includes('center-label')));
});

test('等量九宫格的中心格不是独立核心主题，保持九个并列模块',()=>{
 const items=Array.from({length:9},(_,i)=>slot('grid-'+i,{x:.1+(i%3)*.3,y:.2+Math.floor(i/3)*.22,w:.2,h:.14})),result=inferModules(items,{widthPt:960,heightPt:540});assert.equal(result.centerCount,0);assert.equal(result.moduleCount,9);
});

test('图片与编号不会独自证明案例或数据分析，实际用途未知时保持待核查',()=>{
 assert.notEqual(inferPurpose('工作任务',{textSlots:4,images:5}),'案例展示');
 assert.notEqual(inferPurpose('2026年四项工作',{textSlots:4,images:0}),'数据分析');
 assert.equal(inferPurpose('质量改善成果',{textSlots:4,images:3}),'成果展示');
 assert.equal(inferPurpose('',{textSlots:1,images:0}),'待核查');
 assert.equal(inferPurpose('',{textSlots:0,images:1}),'待核查');assert.equal(inferLogic('',''), '待核查');
});

test('匹配说明列出适用依据；模块、容量和源颜色不符时给具体调整而不自动改色',()=>{
 const request=parseMaterialQuery('四项质量改善成果，每项40字左右，蓝色，可编辑'),good=matchPageTags(card(),request);
 assert.ok(good.reasons.some(s=>s.includes('成果')));assert.ok(good.reasons.some(s=>s.includes('4')));assert.ok(good.reasons.some(s=>s.includes('40')));assert.ok(good.reasons.some(s=>s.includes('蓝')));
 const bad=matchPageTags(card({structure:{moduleCount:3},capacity:{modules:[{id:'small',bodyCapacity:{min:8,max:15}}],confidence:'中'},visual:{colorNames:['红']}}),request);
 assert.ok(bad.score<good.score);assert.ok(bad.adjustments.some(s=>/模块|项/.test(s)));assert.ok(bad.adjustments.some(s=>/压缩|文字|容量/.test(s)));
 assert.ok(bad.adjustments.some(s=>/颜色|配色/.test(s)&&/不改色/.test(s)));
});

test('用途、逻辑或图形编辑能力不符时不能只扣分，须说明限制或调整',()=>{
 const mismatch=matchPageTags(card({purpose:{main:'流程说明',secondary:[]},logic:{primary:'时间',secondary:[]}}),{purpose:'成果展示',logic:'并列'});
 assert.ok(mismatch.adjustments.some(s=>/用途/.test(s)));assert.ok(mismatch.adjustments.some(s=>/逻辑|结构/.test(s)));
 const bitmap=matchPageTags(card({editing:{textEditable:true,graphicsEditable:false,imageObjects:1,imageContentEditable:false}}),{editable:true});
 assert.ok(bitmap.adjustments.some(s=>/图片|图形|编辑/.test(s)));assert.doesNotMatch(bitmap.usable||'',/全部可编辑/);
});

test('未知模块数、缺失标签和未经复核结果保持待核查，不宣称完整匹配或看过全库图片',()=>{
 const missing=matchPageTags(null,{moduleCount:4});assert.equal(missing.usable,null);assert.ok(missing.adjustments.some(s=>/尚未|待/.test(s)));
 const unknown=matchPageTags(card({structure:{moduleCount:null},capacity:{modules:[],confidence:'低'},review:{status:'待视觉复核',method:'native-structure-and-rules'}}),{moduleCount:4,perModuleChars:40});
 assert.ok(unknown.adjustments.some(s=>/模块.*待|模块.*未知|数量.*待/.test(s)));assert.ok(unknown.adjustments.some(s=>/复核|核查/.test(s)));
 assert.ok(!unknown.reasons.some(s=>/4个模块|可容纳40字/.test(s)));
});

test('缺少可识别正文区域时不编造自由排布、主次关系或固定数量',()=>{
 const structure=inferModules([],{widthPt:960,heightPt:540});
 assert.equal(structure.moduleCount,null);assert.equal(structure.moduleCountConfidence,'低');
 assert.equal(structure.layout,'待核查');assert.equal(structure.balance,'待核查');assert.equal(structure.variability,'待核查');
});

test('实际单页索引一页一记录且8维完整，自动标签保留待视觉复核与未知授权',async t=>{
 try{await fs.access(new URL('../data/material-pages.json',import.meta.url));}catch{t.skip('本地素材页索引尚未生成');return;}
 const index=await readMaterialTags(),dimensions=['purpose','logic','structure','capacity','scenario','visual','editing','reuse'];
 assert.equal(index.pages.length,index.totalPages);assert.equal(new Set(index.pages.map(p=>p.sourceId+':'+p.page)).size,index.pages.length);
 assert.equal(index.byId.size,index.pages.length);assert.equal(index.bySourcePage.size,index.pages.length);
 assert.equal(index.pages.filter(p=>p.collection==='用户素材库').length,index.libraryPages);assert.equal(index.pages.filter(p=>p.collection==='效果参考').length,index.referencePages);
 for(const p of index.pages){
  for(const dimension of dimensions)assert.ok(p[dimension],p.id+' 缺 '+dimension);
  assert.equal(p.reuse.authorization,'待核查',p.id+' 不得从用户提供文件推断授权');
  if(p.review.status==='已人工复核'){assert.ok(p.review.reviewedAt);continue;}
  if(p.review.status==='已视觉复核'){assert.equal(p.review.visualAudit.vision.nativeVision,true);assert.match(p.review.visualAudit.imageSha256,/^[a-f0-9]{64}$/);assert.ok(p.review.visualAudit.visualSummary);assert.ok(p.review.visualAudit.runId);}
  else assert.match(p.review.status,/待.*复核/);
  assert.match(p.tagging.method,/自动|规则/);assert.match(p.capacity.warning,/估算|复核|映射/);
  assert.equal(p.capacity.measurement,'native-geometry-estimate');
  if(p.editing.imageObjects>0){assert.equal(p.editing.imageContentEditable,false);assert.equal(p.editing.allObjectsEditable,false);}
 }
});
