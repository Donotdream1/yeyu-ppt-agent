import {normalizeFonts} from '../server/typography.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {readLibrary,sourceBuffer} from '../server/library.mjs';
import {readComponents,nodeBounds,drawingNodes} from '../server/components.mjs';
import {autoCompose,composeDeck} from '../server/composition.mjs';
import {openZip,slideOrder,parse,elements,resolvePart,relPath,serialize} from '../server/ooxml.mjs';
import {prepareChart,drawChart,chartForDeck} from '../server/charts.mjs';
import {readDataFile,parseDelimited} from '../server/data-input.mjs';
import {deckSchema} from '../server/planner.mjs';
import {componentNodes} from '../server/components.mjs';
import {nativeChartMatches} from '../server/recommendations.mjs';

const sourceText='模拟测试数据：一月产量12吨；二月产量18吨；三月产量15吨。';
const chart={code:'S01',title:'模拟测试产量',unit:'吨',grain:'每月一个已确定产量',measureType:'total',aggregation:'none',records:[['一月',12,'一月产量12吨'],['二月',18,'二月产量18吨'],['三月',15,'三月产量15吨']].map(([x,value,sourceQuote])=>({x,value,sourceQuote,series:'产量'}))};
test('图表必须来自原文，重复键、无依据数值和口径缺失会阻断',()=>{
  assert.equal(prepareChart(chart,sourceText).status,'ready');
  assert.equal(prepareChart({...chart,records:[{...chart.records[0],value:999}]},sourceText).status,'blocked');
  assert.equal(prepareChart({...chart,records:[chart.records[0],chart.records[0]]},sourceText).status,'blocked');
  assert.equal(prepareChart({...chart,unit:''},sourceText).status,'blocked');
  assert.equal(prepareChart({...chart,code:'S04'},sourceText).status,'blocked');
});
test('折线缺失值保留，SVG 只有矢量和文字，PNG 标记 240 dpi',async()=>{
  const prepared=prepareChart({...chart,code:'S05',records:[chart.records[0],{...chart.records[1],value:null},chart.records[2]]},sourceText);
  assert.equal(prepared.records[1].value,null);const out=drawChart(prepared);assert.match(out.svg,/<svg/);assert.doesNotMatch(out.svg,/<image|<script|data:image/);
  const rendered=await chartForDeck(prepared,{width:12192000,height:6858000,theme:{primary:'333399',secondary:'BBE0E3'}},{x:.1,y:.2,w:.8,h:.65},10);
  const sharp=(await import('sharp')).default;assert.equal((await sharp(rendered.files.png).metadata()).density,240);
});
test('CSV 保留编号前导零、引号内分隔符和缺失；JSON 提供结构画像',async()=>{
  const rows=parseDelimited('编号,名称,值\n001,"A,B",\n002,C,12',',');assert.equal(rows[1][0],'001');assert.equal(rows[1][1],'A,B');assert.equal(rows[1][2],'');
  const out=await readDataFile(Buffer.from('[{"编号":"001","产量（吨）":12},{"编号":"002","产量（吨）":null}]'),'测试.json');assert.equal(out.profiles[0].fields[0].candidateType,'identifier');assert.equal(out.profiles[0].fields[1].missing,1);assert.equal(out.sha256.length,64);
});
test('比例只有明确尺度才转换为百分数，重复导出不会二次乘以100',()=>{
  const raw={code:'S01',title:'测试占比',unit:'%',grain:'每类别一个占比',measureType:'rate',rateScale:'fraction',records:[{x:'A',value:.42,sourceQuote:'A的占比0.42',series:'占比'}]};
  assert.equal(prepareChart(raw,'A的占比0.42').status,'blocked');
  const prepared=prepareChart(raw,'比例为小数，范围0-1。A的占比0.42');assert.equal(prepared.status,'ready');assert.equal(prepared.records[0].value,42);
  assert.equal(prepareChart(prepared,'比例为小数，范围0-1。A的占比0.42').records[0].value,42);
});
test('原生素材索引包含表格、图表、文本、连接线及组合内的子元素',async t=>{
  const c=await readComponents();if(!c.items.some(c=>c.nodePaths)){t.skip('尚未完成全量原生索引');return;}
  for(const type of ['text','connector','chart','table'])assert.ok(c.items.some(c=>c.type===type),type+' 应保留原生类型');
  const nested=c.items.find(c=>c.nodePaths&&c.type==='text');assert.ok(nested);
  const z=await openZip(await sourceBuffer(nested.sourceId)),doc=parse(await z.file(nested.part).async('string'));const selected=componentNodes(doc,nested);assert.equal(selected.length,1);assert.ok(elements(selected[0],'t').length>0);
});
test('以真实用户模板为包底稿，跨两个素材源重组元素，母版和标志资源不变',async t=>{
  const lib=await readLibrary(),selected=lib.templates?.find(t=>t.id===lib.activeTemplateId),template=selected?{...selected,bnaProfile:undefined}:null;if(!template){t.skip('未导入用户模板');return;}
  const catalog=await readComponents(),icon=catalog.items.find(c=>!c.layout&&['shape','group'].includes(c.type)),image=catalog.items.find(c=>c.type==='image'&&c.sourceId!==icon?.sourceId);if(!icon||!image){t.skip('需要来自两个不同素材源的原生图形和图片；个人素材不随源码分发');return;}
  const input={title:'用户模板重组测试',slides:[{title:'用户模板重组测试',subtitle:'模拟测试数据',kind:'cover',bullets:[],notes:''},{title:'下一步流程',subtitle:'',kind:'process',visual:'process',bullets:['资料整理：统一文档格式','内部试用：核查检索功能','反馈迭代：整理待改进问题'],notes:''},{title:'模拟数据图表',subtitle:'',kind:'content',bullets:[],notes:'模拟测试数据',chart:prepareChart(chart,sourceText)}]};
  const plan=autoCompose(input,template,catalog.items);plan.slides[1].blocks.push({id:'cross-source',type:'component',componentId:image.id,x:.72,y:.68,w:.15,h:.16,bindText:false,colorMode:'source'});
  assert.equal(deckSchema.safeParse({...plan,sourceText}).success,true);
  const out=await composeDeck(plan,template,catalog.items,{chartRenderer:chartForDeck});const zip=await openZip(out.buffer),base=await openZip(await sourceBuffer(template.sourceId)),order=await slideOrder(zip);assert.equal(order.paths.length,3);assert.equal(order.width,template.width);assert.equal(order.height,template.height);
  for(const name of Object.keys(base.files).filter(n=>/^ppt\/(slideMasters|theme|media)\//.test(n)&&!base.files[n].dir))assert.deepEqual(name.endsWith('.xml')?Buffer.from(normalizeFonts(await zip.file(name).async('string'))):await zip.file(name).async('nodebuffer'),name.endsWith('.xml')?Buffer.from(normalizeFonts(await base.file(name).async('string'))):await base.file(name).async('nodebuffer'),`模板资源仅允许统一字体: ${name}`);
  for(const part of order.paths){const doc=parse(await zip.file(part).async('string')),ids=elements(doc,'cNvPr').map(n=>n.getAttribute('id'));assert.equal(new Set(ids).size,ids.length,'重组后原生对象 ID 必须唯一');}
  const overrides=[];for(const part of order.paths){const rels=parse(await zip.file(relPath(part)).async('string'));for(const r of elements(rels,'Relationship').filter(r=>r.getAttribute('Type').endsWith('/themeOverride')))overrides.push(resolvePart(part,r.getAttribute('Target')));}assert.equal(new Set(overrides).size,overrides.length,'每页 themeOverride 必须独立');
  const bound=out.audit.find(a=>a.dataBound);assert.ok(bound,'基础统计图应使用素材库的原生图表');
  const nativePart=Object.keys(zip.files).find(n=>n.includes('/instances/')&&/\/charts\/chart\d+\.xml$/.test(n));assert.ok(nativePart);
  const nativeDoc=parse(await zip.file(nativePart).async('string'));assert.deepEqual(elements(elements(nativeDoc,'val')[0],'v').map(n=>+n.textContent),[12,18,15]);
  const workbook=await openZip(await zip.file(resolvePart(nativePart,elements(parse(await zip.file(relPath(nativePart)).async('string')),'Relationship').find(r=>r.getAttribute('Type').endsWith('/package')).getAttribute('Target'))).async('nodebuffer'));assert.deepEqual(elements(parse(await workbook.file('xl/worksheets/sheet1.xml').async('string')),'v').map(n=>+n.textContent),[12,18,15]);
  for(const file of Object.values(zip.files).filter(f=>!f.dir&&f.name.endsWith('.rels'))){const parent=file.name==='_rels/.rels'?'':file.name.replace(/_rels\/([^/]+)\.rels$/,'$1');for(const r of elements(parse(await file.async('string')),'Relationship')){if(r.getAttribute('TargetMode')==='External')continue;const p=resolvePart(parent,r.getAttribute('Target'));assert.ok(zip.file(p)||zip.file(decodeURI(p)),`资源依赖缺失 ${file.name} -> ${p}`);}}
  assert.ok(out.audit.length>=4);assert.ok(out.charts[0].svg);await fs.mkdir('test-output/v2',{recursive:true});await fs.writeFile('test-output/v2/用户模板元素重组与图表测试.pptx',out.buffer);await fs.writeFile('test-output/v2/S01.svg',out.charts[0].svg);await fs.writeFile('test-output/v2/S01.png',out.charts[0].png);
});
test('重复使用同一原生图表时，每个实例有自己的数据工作簿',async t=>{
  const lib=await readLibrary(),template=lib.templates?.find(t=>t.id===lib.activeTemplateId);if(!template){t.skip('未导入模板');return;}
  const catalog=await readComponents(),firstChart=prepareChart(chart,sourceText),secondChart=prepareChart({...chart,records:chart.records.map((r,i)=>({...r,value:[2,4,6][i],sourceQuote:`${r.x}产量${[2,4,6][i]}吨`}))},'模拟测试数据：一月产量2吨；二月产量4吨；三月产量6吨。');
  if(!catalog.items.some(c=>nativeChartMatches({chart:firstChart},c))){t.skip('需要支持S01数据绑定的原生统计图素材');return;}
  const plan=autoCompose({title:'独立图表',slides:[firstChart,secondChart].map(c=>({title:c.title,kind:'content',bullets:[],chart:c}))},template,catalog.items),out=await composeDeck(plan,template,catalog.items),z=await openZip(out.buffer);
  const parts=Object.keys(z.files).filter(n=>n.includes('/instances/')&&n.endsWith('-data.xlsx'));assert.equal(parts.length,2);assert.notEqual(parts[0],parts[1]);const data=[];
  for(const p of parts){const w=await openZip(await z.file(p).async('nodebuffer'));data.push(elements(parse(await w.file('xl/worksheets/sheet1.xml').async('string')),'v').map(n=>+n.textContent));}assert.deepEqual(data,[[12,18,15],[2,4,6]]);
});
test('更换用户模板后，使用新模板的页面比例和原有母版',async t=>{
  const lib=await readLibrary(),original=lib.templates?.find(t=>t.id===lib.activeTemplateId);if(!original){t.skip('未导入模板');return;}
  const base=await openZip(await sourceBuffer(original.sourceId)),p=parse(await base.file('ppt/presentation.xml').async('string'));elements(p,'sldSz')[0].setAttribute('cx','9144000');base.file('ppt/presentation.xml',serialize(p));const bytes=await base.generateAsync({type:'nodebuffer'}),template={...original,id:'test-template-4-3',sourceId:'test-template-4-3',width:9144000};
  const plan=autoCompose({title:'模板切换',slides:[{title:'模板切换',kind:'cover',subtitle:'切换为4:3底稿',bullets:[]}]},template,[]),out=await composeDeck(plan,template,[],{loadSource:id=>id===template.sourceId?bytes:sourceBuffer(id)}),z=await openZip(out.buffer);assert.equal((await slideOrder(z)).width,9144000);
  for(const n of Object.keys(base.files).filter(n=>/^ppt\/slideMasters\//.test(n)&&!base.files[n].dir))assert.deepEqual(await z.file(n).async('nodebuffer'),n.endsWith('.xml')?Buffer.from(normalizeFonts(await base.file(n).async('string'))):await base.file(n).async('nodebuffer'));
});
