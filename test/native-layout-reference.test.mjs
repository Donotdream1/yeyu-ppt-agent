import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {dataDir,readLibrary} from '../server/library.mjs';
import {openZip,slideOrder,parse,elements,first,relPath,resolvePart} from '../server/ooxml.mjs';
import {inspectNativeReference,validateNativeBindings,validateNativeChartData} from '../server/native-layout-reference.mjs';
import {composeDeck} from '../server/composition.mjs';
import {createLayoutSkill,applyStyleSkill,listStyleSkills,editStyleSkill} from '../server/style-market.mjs';
import {runNativeLayoutWorkflow} from '../server/native-layout-workflow.mjs';

const refFile=path.join(dataDir,'system-layouts/research-defense.json');
const installed=await fs.access(refFile).then(()=>true,()=>false);
test('普通提示词无需YAML也能新建，Arial字体名称可用且换行被拒绝',async()=>{
 const user='plain-layout-'+randomUUID();try{const item=await createLayoutSkill(user,{name:'新建个人版式',content:'按原生参考PPT生成，标题简明，保留源颜色与元素比例。',fontFamily:'Arial'});assert.match(item.content,/^---\nname:/);assert.equal(item.fontFamily,'Arial');assert.equal((await applyStyleSkill(user,{styleSkillId:item.id})).styleSkillSnapshot.fontFamily,'Arial');await assert.rejects(createLayoutSkill(user,{name:'无效',content:'这里是完整的排版规范提示词内容。',fontFamily:'Arial\nother'}),/字体/);}finally{await fs.rm(path.join(dataDir,'style-market',user),{recursive:true,force:true});}
});
test('科研版式绑定真实12页、6图表3表格；提示词复制编辑及默认页数不影响显式页数', {skip:!installed},async()=>{
 const user='native-layout-'+randomUUID(),active=(await readLibrary()).activeTemplateId;
 try{const base=(await listStyleSkills(user)).find(s=>s.id==='research-defense');assert.equal(base.nativeTemplate.pages.length,12);assert.equal(base.nativeTemplate.pages.reduce((n,p)=>n+p.charts.length,0),6);assert.equal(base.nativeTemplate.pages.reduce((n,p)=>n+p.tables,0),3);assert.match(base.content,/不编造显著性/);
 const item=await createLayoutSkill(user,{baseId:base.id,name:'科研自定义',content:base.content+'\n每页只讲一个主题。'});assert.equal(item.nativeTemplate.sourceId,base.nativeTemplate.sourceId);await editStyleSkill(user,item.id,{content:item.content+'\n主标题最多18字。',defaultPageCount:8});
 assert.equal((await applyStyleSkill(user,{styleSkillId:item.id,pageCount:0})).pageCount,8);assert.equal((await applyStyleSkill(user,{styleSkillId:item.id,pageCount:6})).pageCount,6);assert.equal((await applyStyleSkill(user,{styleSkillId:item.id})).templateId,base.nativeTemplate.templateId);assert.equal((await readLibrary()).activeTemplateId,active);assert.ok(!(await listStyleSkills('foreign-user')).some(s=>s.id===item.id));
 }finally{await fs.rm(path.join(dataDir,'style-market',user),{recursive:true,force:true});}
});
test('原生槽全量填写、容量、数据来源检查阻止漏写和模板数据泄漏',()=>{
 const ref={slots:[{key:'shape:1',maxChars:4},{key:'shape:2',maxChars:6,fixed:true}],charts:[{supported:true}]};
 assert.throws(()=>validateNativeBindings(ref,[]),/所有/);assert.throws(()=>validateNativeBindings(ref,[{key:'shape:1',text:'过长的文字内容'}]),/精简/);assert.throws(()=>validateNativeBindings(ref,[{key:'shape:1',text:'测试'},{key:'shape:1',text:'重复'}]),/重复/);
 assert.throws(()=>validateNativeChartData(ref,[{index:0,unit:'次',records:[{x:'A',series:'样本',value:8,sourceQuote:'模板数值8'}]}],'原文没有数据'),/原文/);assert.equal(validateNativeChartData(ref,[{index:0,records:[]}],'文档').length,1);
});
test('原生全页复用保持12页几何与可编辑结构，图表清除示例且工作簿互不覆盖', {skip:!installed},async()=>{
 const ref=JSON.parse(await fs.readFile(refFile,'utf8')),source=await fs.readFile(path.join(dataDir,'sources',ref.sourceId+'.pptx')),template=(await readLibrary()).templates.find(t=>t.id===ref.templateId);
 const plan={title:'原生结构验收',styleSkillSnapshot:{fontPolicy:{title:'微软雅黑',body:'黑体',latin:'Arial'}},designProfile:'material',slides:ref.pages.map(p=>({title:'验收页',kind:p.kind,bullets:[],templatePage:p.page,blocks:[],materialSnapshot:{...p,id:'check-'+p.page,sourceId:ref.sourceId,sourceName:ref.name,sourceFullPage:true,nativeReference:true,chartData:p.charts.map(c=>({index:c.index,title:'待补充数据',unit:'',records:[]}))},materialBindings:p.slots.map(s=>({key:s.key,slot:s.index,text:s.fixed?String(p.page).padStart(2,'0')+' / 12':'待补充'}))}))};
 const result=await composeDeck(plan,template,[]),zip=await openZip(result.buffer),original=await openZip(source),a=await slideOrder(original),b=await slideOrder(zip);assert.equal(b.paths.length,12);assert.equal(a.width,b.width);assert.equal(a.height,b.height);let charts=0,tables=0;const workbooks=new Set();
 for(let i=0;i<12;i++){const before=parse(await original.file(a.paths[i]).async('string')),after=parse(await zip.file(b.paths[i]).async('string'));assert.equal(elements(before,'cNvPr').length,elements(after,'cNvPr').length);const geo=d=>elements(d,'xfrm').map(n=>n.toString());assert.deepEqual(geo(before),geo(after));charts+=elements(after,'chart').length;tables+=elements(after,'tbl').length;
  const rels=parse(await zip.file(relPath(b.paths[i])).async('string'));
  for(const tag of elements(after,'chart')){const rel=elements(rels,'Relationship').find(r=>r.getAttribute('Id')===tag.getAttribute('r:id')),part=resolvePart(b.paths[i],rel.getAttribute('Target')),chart=parse(await zip.file(part).async('string'));assert.equal(elements(chart,'ser').length,0);const rf=parse(await zip.file(relPath(part)).async('string'));for(const r of elements(rf,'Relationship').filter(r=>r.getAttribute('Type').endsWith('/package'))){const workbook=resolvePart(part,r.getAttribute('Target'));assert.ok(!workbooks.has(workbook),'图表数据工作簿不可共用');workbooks.add(workbook);assert.ok(zip.file(workbook));}}
 }
 assert.equal(charts,6);assert.equal(tables,3);assert.equal(result.audit.length,12);assert.ok(result.audit.every(a=>a.fullSourcePage&&a.sourceNativeObjects===a.nativeObjectCount));
});
test('Hermes原生工作流逐页提交，真实数据不足时不继承样例，并支持保存断点', {skip:!installed},async()=>{
 const body=await applyStyleSkill('native-workflow-test',{styleSkillId:'research-defense',document:'系统验收内容，仅说明数据层、方法层、验证层的研究路线，不提供任何实际统计数据。',apiKey:'test-key',pageCount:12}),id=randomUUID();let calls=0;
 const runAgent=async({role,onTool,onMetrics})=>{calls++;if(role==='native-layout-planner')await onTool('ppt_submit_native_plan',{title:'工作流验收',slides:body.styleSkillSnapshot.nativeTemplate.pages.map(p=>({title:p.kind==='agenda'?'目录':'结构验收',kind:p.kind,templatePage:p.page,bullets:['仅说明真实结构'],notes:''}))});else{const page=Number(role.split('-').pop()),p=body.styleSkillSnapshot.nativeTemplate.pages[page-1];await onTool('ppt_fill_native_page',{bindings:p.slots.filter(s=>!s.fixed).map(s=>({key:s.key,text:'待补充'})),charts:p.charts.map(c=>({index:c.index,title:'待补充数据',unit:'',records:[]}))});}onMetrics?.({modelRequests:1});};
 try{const output=await runNativeLayoutWorkflow(body,{checkpointId:id,runAgent,saveOutput:async plan=>({plan,id:randomUUID(),pages:plan.slides.length})});assert.equal(calls,13);assert.equal(output.pages,12);assert.ok(output.plan.slides.every(s=>s.adaptation.status==='checked'));assert.equal(output.plan.slides[5].materialSnapshot.chartData[0].records.length,0);const checkpoint=JSON.parse(await fs.readFile(path.join(dataDir,'workflows',id+'.json'),'utf8'));assert.equal(checkpoint.status,'done');assert.ok(!JSON.stringify(checkpoint).includes('test-key'));}
 finally{await fs.rm(path.join(dataDir,'workflows',id+'.json'),{force:true});}
});
