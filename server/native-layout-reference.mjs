import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {openZip,slideOrder,parse,elements,first,relPath,resolvePart} from './ooxml.mjs';
import {registerTemplate,drawingNodes,nodeBounds,absoluteNodeBounds,direct} from './components.mjs';
import {editableTextTargets} from './material-layouts.mjs';
import {slotKey} from './material-analysis.mjs';
import {extractPptStyle} from './style-market.mjs';
import {dataDir} from './library.mjs';

// A reference is a complete page, not a body crop. Its object geometry and
// relationships are immutable; the agent can only replace the declared slots.
export function nativeReferencePalette(ref){
 const colors=[...new Set((ref.parameters?.colors||[]).map(c=>c.value?.toUpperCase()).filter(c=>/^[0-9A-F]{6}$/.test(c)))],chromatic=c=>{const rgb=c.match(/../g).map(v=>parseInt(v,16));return Math.max(...rgb)-Math.min(...rgb)>20;},primary=colors.find(chromatic)||colors.find(c=>c!=='FFFFFF')||'202020',secondary=colors.find(c=>c!==primary&&chromatic(c))||primary;
 return {mode:'material',sourceId:ref.sourceId,sourceName:ref.name,primary,secondary,bar:primary,accent:secondary,text:'202020',background:'FFFFFF',colors,provenance:{kind:'native-reference-observed-colors',preserveSource:true}};
}
export async function inspectNativeReference(buffer,name){
 const zip=await openZip(buffer),order=await slideOrder(zip);
 if(order.paths.length>80)throw Error('版式参考PPT最多80页，请先拆分套系');
 const parameters=await extractPptStyle(buffer),pages=[];
 for(const [i,part]of order.paths.entries()){
  const doc=parse(await zip.file(part).async('string')),slots=[];
  for(const node of drawingNodes(doc).flatMap(editableTextTargets)){
   const text=elements(first(node,'txBody'),'t').map(n=>n.textContent).join(''),box=nodeBounds(node),sizes=elements(node,'rPr').map(n=>+n.getAttribute('sz')/100).filter(Boolean),fontSize=Math.max(0,...sizes),key=slotKey(node);
   if(!text.trim())continue;
   const footer=/^\d{1,2}\s*\/\s*\d{1,2}$/.test(text.trim()),symbol=/^[✓✔■▪●→←↑↓↔↕]$/.test(text.trim()),chapter=fontSize>=28&&/^\d+(?:\.\d+)*$/.test(text.trim()),endingTitle=i===order.paths.length-1&&fontSize>=28&&/感谢|谢谢|thank/i.test(text),header=text.trim()==='科研答辩'&&box&&box.y/order.height<.15,institution=box&&box.y/order.height<.15&&/机构名称|机构标识|学校名称/.test(text);
   slots.push({index:slots.length,key,text,role:footer?'page-number':institution?'institution':chapter?'chapter-number':endingTitle?'ending-title':symbol?'symbol':header?'header-label':fontSize>=28?'title':node.localName==='tc'?'table-cell':'body',fontSizePt:fontSize,sourceFontSizesPt:[...new Set(sizes)],bounds:box,absoluteBounds:absoluteNodeBounds(node),fontFamilies:[...new Set(['ea','latin'].flatMap(k=>elements(node,k).map(n=>n.getAttribute('typeface'))).filter(Boolean))],bold:elements(node,'rPr').some(n=>n.getAttribute('b')==='1'),align:first(node,'pPr')?.getAttribute('algn')||'source-default',verticalAnchor:first(node,'bodyPr')?.getAttribute('anchor')||'source-default',maxChars:Math.max(text.length,footer?10:fontSize>=28?24:8),fixed:footer?true:institution?'institution':symbol?'symbol':chapter?'chapter':endingTitle?'ending-title':header?'header-label':undefined});
  }
  const charts=[],rf=zip.file(relPath(part)),rels=rf?parse(await rf.async('string')):null;
  for(const tag of elements(doc,'chart')){const rel=elements(rels,'Relationship').find(r=>r.getAttribute('Id')===tag.getAttribute('r:id'));if(!rel)continue;const target=resolvePart(part,rel.getAttribute('Target')),chart=parse(await zip.file(target).async('string'));const types=['barChart','lineChart','pieChart','scatterChart','areaChart','doughnutChart'].filter(t=>elements(chart,t).length);charts.push({index:charts.length,relationshipId:tag.getAttribute('r:id'),types,title:elements(first(chart,'title')||chart.createElement('title'),'t').map(t=>t.textContent).join(''),editable:true,supported:types.length===1&&['barChart','lineChart','pieChart'].includes(types[0])});}
  const visualObjects=['sp','pic','graphicFrame','cxnSp'].flatMap(type=>elements(doc,type).map(node=>{const props=direct(node,'spPr');return {id:first(node,'cNvPr')?.getAttribute('id'),type,bounds:absoluteNodeBounds(node)||nodeBounds(node),fill:props&&first(direct(props,'solidFill')||props,'srgbClr')?.getAttribute('val'),hasImage:type==='pic',editable:type!=='pic'};}));
  pages.push({page:i+1,part,visualObjects,images:elements(doc,'pic').length,kind:i===0?'cover':i===order.paths.length-1?'ending':/目录|汇报内容/.test(slots.map(s=>s.text).join(' '))?'agenda':'content',slots,charts,objects:elements(doc,'cNvPr').length-1,tables:elements(doc,'tbl').length});
 }
 return {parameters,pages,width:order.width,height:order.height,name};
}

export async function registerNativeReference(buffer,name,{privateOwner}={}){
 const analysis=await inspectNativeReference(buffer,name);
 if(privateOwner){const sourceId=createHash('sha256').update(buffer).digest('hex').slice(0,16),id='layout-'+randomUUID(),previewKey=randomUUID(),template={id,sourceId,name,width:analysis.width,height:analysis.height,pages:analysis.pages.map(p=>({part:p.part,page:p.page})),theme:{font:'微软雅黑',primary:'164C78',text:'202020'},safeArea:{x:.022,y:.025,w:.956,h:.95},privateOwner};await fs.mkdir(path.join(dataDir,'native-layouts'),{recursive:true});await fs.writeFile(path.join(dataDir,'sources',sourceId+'.pptx'),buffer);await fs.writeFile(path.join(dataDir,'native-layouts',id+'.json'),JSON.stringify(template));return {...analysis,templateId:id,sourceId,previewKey,private:true,preview:`/api/previews/${previewKey}/1.png`};}
 const template=await registerTemplate(buffer,name,{activate:false});
 return {...analysis,templateId:template.id,sourceId:template.sourceId,preview:`/api/previews/${template.sourceId}/1.png`};
}

export async function builtinResearchStyle(base){
 const root=path.resolve('agents/skills/research-defense-layout');
 try{const ref=JSON.parse(await fs.readFile(path.join(dataDir,'system-layouts','research-defense.json'),'utf8'));let modelAnalysis;try{const a=JSON.parse(await fs.readFile(path.join(dataDir,'system-layouts','research-defense-model.json'),'utf8'));if(a.sourceId===ref.sourceId&&a.completedPages===ref.pages.length){modelAnalysis=a;ref.pages=ref.pages.map(p=>{const analysis=a.pages.find(v=>v.page===p.page);return {...p,analysis,slots:p.slots.map(s=>{const t=analysis.slots.find(v=>v.key===s.key);return {...s,semanticRole:t?.role,semanticDescription:t?.description,moduleNames:analysis.modules.filter(m=>m.slotKeys.includes(s.key)).map(m=>m.name)};})};});}}catch(e){if(e.code!=='ENOENT')throw e;}return {...base,modelAnalysis,name:'蓝白科研答辩 · 12页',description:'原生图表、表格与A—D类结构图；含首页、目录和结束页。',content:await fs.readFile(path.join(root,'SKILL.md'),'utf8'),sourceId:ref.sourceId,preview:ref.preview,nativeTemplate:ref,parameters:{...ref.parameters,recommended:{units:'pt',fontSizes:{cover:[40,44],subtitle:24,chapter:32,title:32,section:21,module:17,viewpoint:16,body:14,tableHeader:14,tableBody:13,axis:[11,12],conclusion:15,page:10},colors:{background:'FFFFFF',title:'164C78',banner:'1044A4',module:'EDF2FC',border:'B8C0C6',body:'202020',helper:'666666',emphasis:'B54A50'},regionsCm:{header:[.5,1.8],viewpoint:{y:2.3,h:1.5},banner:{y:4.05,h:1.2},content:[5.5,16.9],conclusion:{y:17.2,h:1.3}},note:'建议值；实际源对象字号、颜色及几何以原生参考PPT为准'}},defaultPageCount:12,fontPolicy:{title:'微软雅黑',body:'黑体',latin:'Arial'},origin:'用户参考PPT · 12页'};}
 catch(e){if(e.code==='ENOENT')return base;throw e;}
}

export function validateNativeBindings(referencePage,bindings){
 if(!Array.isArray(bindings))throw Error('请提交原生文本槽数组');
 const expected=new Map(referencePage.slots.filter(s=>!s.fixed).map(s=>[s.key,s])),seen=new Set(),issues=[];
 for(const b of bindings){const slot=expected.get(b.key);if(!slot||seen.has(b.key)||typeof b.text!=='string'){issues.push({key:b.key,error:'文本槽不存在、重复或内容不是字符串'});continue;}seen.add(b.key);if(b.text.length>slot.maxChars)issues.push({key:b.key,maxChars:slot.maxChars,actualChars:b.text.length,text:b.text,error:'请精简此槽文案，保持原字号'});}
 for(const key of expected.keys())if(!seen.has(key))issues.push({key,error:'请提交所有可替换文本槽，缺少信息明确待补充'});
 if(issues.length)throw Object.assign(Error('请一次修复全部文本槽：'+issues.map(v=>v.key+' '+(v.maxChars?'最多'+v.maxChars+'字（当前'+v.actualChars+'字），请精简':v.error)).join('；')),{issues});
 return bindings;
}

export function validateNativeChartData(referencePage,datasets,document){
 if(!Array.isArray(datasets)||datasets.length!==referencePage.charts.length)throw Error('每个原生图表必须提交数据或明确标记待补充');
 const seen=new Set();
 for(const d of datasets){if(!Number.isInteger(d.index)||!referencePage.charts[d.index]||seen.has(d.index))throw Error('原生图表编号无效');seen.add(d.index);if(!Array.isArray(d.records)||d.records.length>1000)throw Error('图表记录无效');if(d.records.length&&(!d.unit?.trim()||!document.includes(d.unit.trim())))throw Error('图表单位须在用户原文中明确出现；缺单位请提交records:[]，不要编造单位');for(const r of d.records){if(typeof r.x!=='string'||typeof r.series!=='string'||!Number.isFinite(r.value)||typeof r.sourceQuote!=='string'||!document.includes(r.sourceQuote)||!r.sourceQuote.includes(String(r.value)))throw Error('图表数值必须包含可核验的原文数字与逐字来源');}if(d.records.length&&!referencePage.charts[d.index].supported)throw Error('此原生图表暂不支持安全换数，请保留为空数据位或换版');}
 return datasets;
}
