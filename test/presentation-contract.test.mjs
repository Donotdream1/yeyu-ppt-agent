import test from 'node:test';
import assert from 'node:assert/strict';
import {headlineIssues,createPresentationContract} from '../server/presentation-contract.mjs';
import {deckSchema} from '../server/planner.mjs';

test('过长中文标题给出页码和实际字数，编号不计入且不截断原文',()=>{
 const title='1.2 青年成长与岗位创新和数字化技能专项培养活动开展情况及后续实施安排';
 const plan={slides:[{kind:'content',title},{kind:'content',title:'1.3 数智培训聚焦AI应用'},{kind:'agenda',title:'目录'}]};
 const issues=headlineIssues(plan);assert.equal(issues.length,1);assert.equal(issues[0].page,1);assert.equal(issues[0].limit,24);assert.equal(issues[0].actual,Array.from(title.replace('1.2 ','')).length);assert.equal(plan.slides[0].title,title);assert.match(issues[0].issue,/正文.*截断/);
});
test('跨页约束保存实际画布、pt单位、微软雅黑、20pt导航及原色权限，不包含凭据',()=>{
 const template={id:'user-template',width:12192000,height:6858000},lock=createPresentationContract({palette:{sourceId:'source-a'}},template,{apiKey:'secret',paletteMode:'material'});
 assert.equal(lock.units.font,'pt');assert.equal(lock.units.emuPerPt,12700);assert.equal(lock.fonts.navigationPt,20);assert.equal(lock.palette.preserveSourceColors,true);assert.equal(lock.canvas.width,template.width);assert.ok(!JSON.stringify(lock).includes('secret'));
 const parsed=deckSchema.parse({title:'测试',slides:[{title:'关键工作',bullets:['依据']}],designLock:lock});assert.equal(parsed.designLock.fonts.family,'微软雅黑');assert.equal(createPresentationContract({},template,{paletteMode:'user'}).palette.preserveSourceColors,false);
});
