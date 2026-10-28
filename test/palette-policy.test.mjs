import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,serialize} from '../server/ooxml.mjs';
import {harmonizeNative,harmonizedText} from '../server/design-system.mjs';
import {decidePresentationStyle,paletteCandidates} from '../server/presentation-style.mjs';
import {resolvePalette} from '../server/material-palette.mjs';
import {createHermesSession} from '../server/hermes-workflow.mjs';
import JSZip from 'jszip';
import {elements,first,NS} from '../server/ooxml.mjs';
import {bindNativeChart} from '../server/native-charts.mjs';

const xml='<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:spPr><a:solidFill><a:srgbClr val="E58F39"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="004695"/></a:solidFill></a:ln></p:spPr><p:txBody><a:p><a:r><a:rPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>原色文字</a:t></a:r></a:p></p:txBody></p:sp>';
test('默认素材模式完整保留图形、线条和文字颜色，明确自定义时才染色',()=>{
 const node=parse(xml).documentElement,before=serialize(node),template={theme:{primary:'FF0000',text:'000000'},designPalette:{mode:'material'}};
 harmonizeNative(node,template);harmonizedText(node,node,template);assert.equal(serialize(node),before);
 harmonizeNative(node,{...template,designPalette:{mode:'user',primary:'FF0000',colors:['FF0000']}});assert.notEqual(serialize(node),before);
});
test('文档风格不会修改色板主色，调用者改动不污染素材缓存',async()=>{
 const source=(await paletteCandidates())[0],template={theme:{primary:'333333'}},input={document:'政策宣讲材料介绍政策背景及落实情况。',paletteSourceId:source.sourceId,paletteMode:'material',designProfile:'auto'};
 const original=await resolvePalette({sourceId:source.sourceId},template),decision=await decidePresentationStyle({family:'public-policy',evidence:['政策宣讲材料'],paletteMood:'red'},input,template);
 assert.equal(decision.palette.primary,original.primary);assert.deepEqual(decision.palette.colors,original.colors);
 decision.palette.primary='ABCDEF';decision.palette.colors[0]='ABCDEF';
 assert.deepEqual(await resolvePalette({sourceId:source.sourceId},template),original);
 const custom=await decidePresentationStyle({family:'business',evidence:['政策宣讲材料']},{...input,paletteMode:'user',userColors:{primary:'123456'}},template);assert.equal(custom.palette.primary,'123456');
});
test('仅识别任务不能越界提交大纲或导出',async()=>{
 const session=await createHermesSession({document:'本季度工作汇报说明进展、风险及下季度资源计划。',styleOnly:true});
 assert.equal((await session.handle('ppt_get_brief')).styleOnly,true);
 await assert.rejects(()=>session.handle('ppt_submit_outline',{}),/仅识别/);
 await assert.rejects(()=>session.handle('ppt_publish'),/仅识别/);
});
test('原生图表换数据保留各系列和数据点原色，用户要求后才改色',async()=>{
 const zip=new JSZip(),part='ppt/charts/chart1.xml',C='http://schemas.openxmlformats.org/drawingml/2006/chart';
 const series=(i,color)=>`<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr><c:dPt><c:idx val="0"/><c:spPr><a:solidFill><a:srgbClr val="E58F39"/></a:solidFill></c:spPr></c:dPt></c:ser>`;
 const original=`<c:chartSpace xmlns:c="${C}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><c:chart><c:plotArea><c:barChart>${series(0,'004695')}${series(1,'2D6EB0')}</c:barChart></c:plotArea></c:chart></c:chartSpace>`;
 const data={status:'ready',code:'S02',title:'结果',unit:'件',records:[{x:'甲',series:'A',value:12},{x:'甲',series:'B',value:18}]};
 zip.file(part,original);await bindNativeChart(zip,part,data,()=>{},{theme:{primary:'FF0000'},designPalette:{mode:'material'}});
 const doc=parse(await zip.file(part).async('string')),sers=elements(doc,'ser');
 assert.deepEqual(sers.map(s=>first(first(s,'spPr'),'srgbClr').getAttribute('val')),['004695','2D6EB0']);assert.equal(elements(doc,'dPt').length,2);
 await bindNativeChart(zip,part,data,()=>{},{theme:{primary:'FF0000'},designPalette:{mode:'user',colors:['FF0000']}});
 assert.deepEqual(elements(parse(await zip.file(part).async('string')),'ser').map(s=>first(first(s,'spPr'),'srgbClr').getAttribute('val')),['FF0000','FF0000']);
});
