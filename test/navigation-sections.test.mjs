import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationSections,navigationIssues,navigationPolicy} from '../server/navigation-sections.mjs';
import {normalizePresentationOutline} from '../server/presentation-outline.mjs';
import {layoutBnaContent} from '../server/bna-template.mjs';
import {deckSchema} from '../server/planner.mjs';
import {storyboardTool,PLANNER_CONTRACT} from '../server/workflow-prompts.mjs';
import {parse,first,elements,textShape,NS} from '../server/ooxml.mjs';
const template={id:'bna',width:12192000,height:6858000,bnaProfile:{bodyArea:{x:.04,y:.205,w:.92,h:.74},sections:['旧导航1','旧导航2','旧导航3','旧导航4']}};
const outline=sections=>({title:'机器人研发评审',sections,slides:[{kind:'cover',title:'机器人研发评审',bullets:[]},{kind:'agenda',title:'目录',bullets:sections},...sections.map((title,sectionIndex)=>({kind:'content',title,sectionIndex,bullets:['本章事实依据']})),{kind:'ending',title:'谢谢',bullets:[]}]});
test('主题相关关键词进入大纲schema和渲染参数，模板示例不覆盖新章节',()=>{
 const sections=['业务需求','技术方案','试验结果','迭代计划'],plan=deckSchema.parse(normalizePresentationOutline(outline(sections)));assert.deepEqual(plan.sections,sections);assert.deepEqual(navigationIssues(plan,template),[]);
 const doc=parse(`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree>${textShape(2,'2.1 路径规划',0,1000000,8000000,500000,30)}</p:spTree></p:cSld></p:sld>`);
 const report=layoutBnaContent(doc,template,template.bnaProfile,plan.slides[4],4,plan.sections);assert.deepEqual(report.navigationSections,sections);assert.equal(report.activeSection,2);
 const nodes=elements(doc,'sp').filter(s=>first(s,'cNvPr')?.getAttribute('name')?.startsWith('navigation:'));assert.equal(nodes.length,4);assert.deepEqual(nodes.map(s=>elements(s,'t').map(t=>t.textContent).join('')),sections);assert.ok(nodes.every(s=>first(s,'rPr').getAttribute('sz')==='2000'&&first(s,'rPr').getAttribute('b')==='1'));assert.equal(first(nodes[2],'rPr').getAttribute('u'),'sng');
 layoutBnaContent(doc,template,template.bnaProfile,plan.slides[4],4,plan.sections);assert.equal(elements(doc,'sp').filter(s=>first(s,'cNvPr')?.getAttribute('name')?.startsWith('navigation:')).length,4);
});
test('科研与项目主题采用各自章节关键词，少于四章时不填入空章节',()=>{
 for(const sections of [['研究背景','方法设计','实验验证','研究展望'],['项目进展','实施安排']]){const p=normalizePresentationOutline(outline(sections));assert.deepEqual(navigationSections(p),sections);assert.deepEqual(navigationIssues(p,template),[]);}
 assert.deepEqual(navigationSections({slides:[{kind:'agenda',bullets:['一、市场定位：目标用户','2.1 产品架构'] }]}),['市场定位','产品架构']);
 assert.deepEqual(navigationSections({sections:'需求分析、系统方案、验证结果',slides:[]}),['需求分析','系统方案','验证结果']);
});
test('重复、过长、无正文的导航与越界章节在规划阶段拦截',()=>{
 for(const p of [outline(['技术方案','技术方案']),outline(['这是非常冗长而不适合作为关键词的章节说明']),{...outline(['业务需求','技术方案']),slides:outline(['业务需求','技术方案']).slides.map(s=>({...s,sectionIndex:0}))}])assert.ok(navigationIssues(p,template).length>0);
 const bad=outline(['需求分析']);bad.slides[2].sectionIndex=3;assert.ok(navigationIssues(bad,template).some(i=>/sectionIndex/.test(i.issue)));
});
test('规划工具以可读空间和正文页数为上限，四项模板不限制新文档章数',()=>{
 const capacity=navigationPolicy(template).maxSections,t=storyboardTool(12,{maxSections:capacity});assert.ok(t.parameters.properties.plan.required.includes('sections'));assert.equal(t.parameters.properties.plan.properties.sections.maxItems,9);assert.equal(storyboardTool(8).parameters.properties.plan.properties.sections.maxItems,5);assert.equal(storyboardTool().parameters.properties.plan.properties.sections.maxItems,10);assert.match(PLANNER_CONTRACT,/本次文档和主题提炼/);assert.match(PLANNER_CONTRACT,/不强凑四章/);
});

test('两、三、五、六章使用实际数量，目录、导航与高亮一致且原字号不变',()=>{
 const keywords=['需求','目标','架构','功能','实施','保障'];
 for(const count of [2,3,5,6]){
  const sections=keywords.slice(0,count),plan=normalizePresentationOutline(outline(sections));assert.deepEqual(navigationIssues(plan,template),[]);assert.equal(plan.slides[1].bullets.length,count);
  const doc=parse(`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree>${textShape(2,'章节标题',0,1000000,8000000,500000,30)}</p:spTree></p:cSld></p:sld>`);
  const report=layoutBnaContent(doc,template,template.bnaProfile,plan.slides[count+1],count+1,sections),nodes=elements(doc,'sp').filter(s=>first(s,'cNvPr')?.getAttribute('name')?.startsWith('navigation:'));
  assert.equal(nodes.length,count);assert.equal(report.activeSection,count-1);assert.deepEqual(report.navigationSections,sections);assert.equal(nodes.filter(n=>first(n,'rPr').getAttribute('u')==='sng').length,1);assert.ok(nodes.every(n=>first(n,'rPr').getAttribute('sz')==='2000'));
  for(let i=1;i<nodes.length;i++){const a=first(nodes[i-1],'xfrm'),b=first(nodes[i],'xfrm');assert.ok(+first(a,'off').getAttribute('x')+(+first(a,'ext').getAttribute('cx'))<=+first(b,'off').getAttribute('x'));}
 }
});

test('没有文档章节时不会偷偷补入模板四项导航，密集长标签须先精简',()=>{
 const doc=parse(`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree/></p:cSld></p:sld>`);const report=layoutBnaContent(doc,template,template.bnaProfile,{kind:'content',sectionIndex:0},2);assert.deepEqual(report.navigationSections,[]);
 const sections=['研究背景说明','研究方法设计','实验验证分析','系统架构设计','实施计划安排','成果应用方向'];assert.ok(navigationIssues(outline(sections),template).some(i=>/过长/.test(i.issue)));
});
