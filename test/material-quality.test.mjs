import test from 'node:test';
import assert from 'node:assert/strict';
import {agendaItemCount,duplicateMaterialPages,describeSlotSemantics,balancedLabelText,semanticCopyIssues} from '../server/material-semantics.mjs';
import {parse,elements,first,NS,serialize} from '../server/ooxml.mjs';
import {uniformLabelFontSize,replaceTextPreservingStyles} from '../server/typography.mjs';
import {applyBindingStyle,centerLabelOnContainer,fitTwoLineLabel} from '../server/binding-style.mjs';
import {rankMaterialLayouts} from '../server/material-layouts.mjs';
import fs from 'node:fs/promises';
import {openZip,slideOrder,textShape} from '../server/ooxml.mjs';
import {composeDeck} from '../server/composition.mjs';
import {replaceExamplePhotos} from '../server/source-photos.mjs';

test('目录按真实固定编号计数，四项章节不会选八项素材',()=>{
 const make=n=>({id:'agenda'+n,layout:true,purpose:'agenda',relation:'agenda',title:'目录',text:'',tags:[],nativeObjects:10,slots:Array.from({length:n},(_,i)=>({index:i,fixed:String(i+1).padStart(2,'0'),role:'number'}))});
 assert.equal(agendaItemCount(make(8)),8);
 assert.deepEqual(rankMaterialLayouts({kind:'agenda',title:'目录',bullets:['甲','乙','丙','丁']},[make(8),make(4)]).map(r=>r.component.id),['agenda4']);
});
test('结束页拒绝提问页，即使它的关键词相关度更高',()=>{
 const c={layout:true,relation:'parallel',title:'感谢聆听',text:'感谢聆听',tags:[],nativeObjects:12,slots:[{index:0,role:'label',maxChars:20}]};
 assert.deepEqual(rankMaterialLayouts({kind:'ending',visual:'text',title:'感谢聆听',bullets:['感谢聆听']},[{...c,id:'question',purpose:'content'},{...c,id:'end',purpose:'ending'}]).map(r=>r.component.id),['end']);
});
test('同一源文件同一页的不同组合ID也算重复，母版重复不受影响',()=>{
 const s=id=>({materialId:id,materialSnapshot:{id,sourceId:'source',page:8}});
 assert.equal(duplicateMaterialPages([{},s('a'),s('b')]).length,1);
 assert.deepEqual(duplicateMaterialPages([s('a'),{materialId:'b',materialSnapshot:{sourceId:'source',page:9}}]),[]);
});
test('窄框中的四字标签按两字两行，宽框与英文不强制换行',()=>{
 assert.equal(balancedLabelText('工作对象',{role:'label',font:18},{widthPt:60}),'工作\n对象');
 assert.equal(balancedLabelText('工作对象',{role:'label',font:18},{widthPt:100}),'工作对象');
 assert.equal(balancedLabelText('AI应用',{role:'label',font:18},{widthPt:60}),'AI应用');
});
test('层级素材的上级总标题与下方两个子标题分别识别',()=>{
 const slots=[{index:0,role:'label',sample:'总标题',position:{x:.17,y:.3,w:.15,h:.05}},{index:1,role:'label',sample:'子项甲',position:{x:.09,y:.4,w:.15,h:.05}},{index:2,role:'label',sample:'子项乙',position:{x:.31,y:.4,w:.15,h:.05}}];
 describeSlotSemantics(slots,{});assert.equal(slots[0].semanticRole,'group-title');assert.equal(slots[2].parentSlot,0);
 assert.ok(semanticCopyIssues({kind:'content'},{slots},[{slot:0,text:'画面二'}]).length);
});
test('时间节点下方的标题不能重复日期；日期与事件标题必须分工',()=>{
 const slots=[{index:0,sample:'2006年',role:'label',position:{x:.1,y:.4,w:.08,h:.04}},{index:1,sample:'奠定',role:'label',position:{x:.1,y:.46,w:.08,h:.04}}];describeSlotSemantics(slots,{relation:'timeline'});
 assert.equal(slots[1].semanticRole,'event-title');assert.equal(slots[1].pairedSlot,0);
 assert.equal(semanticCopyIssues({},{slots},[{slot:0,text:'10日'},{slot:1,text:'10日 AI培训'}]).length,1);
 assert.deepEqual(semanticCopyIssues({},{slots},[{slot:0,text:'10日'},{slot:1,text:'AI培训'}]),[]);
});

test('日期槽按数字视觉宽度留出容量，不把完整月日删掉单位来凑粗略字数',()=>{
 const slots=[{index:0,sample:'2006年',role:'label',font:14,maxChars:4,position:{x:.1,y:.4,w:.078,h:.04}}];describeSlotSemantics(slots,{width:12192000,relation:'timeline'});
 assert.equal(slots[0].maxChars,6);assert.deepEqual(semanticCopyIssues({},{slots},[{slot:0,text:'9月10日'}]),[]);assert.ok(semanticCopyIssues({},{slots},[{slot:0,text:'9月10'}]).length);
});
const wrap=body=>parse(`<p:sp xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="600000" cy="400000"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr><p:txBody><a:bodyPr><a:spAutoFit/></a:bodyPr>${body}</p:txBody></p:sp>`);
test('同一短标题继承主字号，局部示例大字不随机映射到新文案',()=>{
 const doc=wrap('<a:p><a:r><a:rPr sz="1600"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>企业文</a:t></a:r><a:r><a:rPr sz="3200"/><a:t>化</a:t></a:r></a:p>'),shape=doc.documentElement,before=serialize(first(shape,'spPr'));
 assert.equal(uniformLabelFontSize(shape),16);replaceTextPreservingStyles(doc,shape,'企业文化');
 assert.deepEqual(elements(shape,'rPr').map(n=>n.getAttribute('sz')),['1600','1600']);assert.equal(serialize(first(shape,'spPr')),before);assert.equal(first(shape,'srgbClr').getAttribute('val'),'FFFFFF');
});
test('明确居中的标签去除源段落偏移并锁定文字框，不由自动扩框向下漂移',()=>{
 const doc=wrap('<a:p><a:pPr marL="3000"><a:spcBef><a:spcPts val="600"/></a:spcBef></a:pPr><a:r><a:rPr sz="1800" baseline="-1000"/><a:t>关心</a:t></a:r></a:p>');applyBindingStyle(doc.documentElement,{align:'center',vAlign:'middle',bold:true});
 assert.equal(elements(doc,'spAutoFit').length,0);assert.equal(first(doc,'bodyPr').getAttribute('anchor'),'ctr');assert.equal(elements(doc,'spcBef').length,0);assert.equal(first(doc,'rPr').hasAttribute('baseline'),false);assert.equal(first(doc,'pPr').getAttribute('algn'),'ctr');
});

test('圆形背景与独立文字框的中心重新对齐，不能只修改文字anchor',()=>{
 const d=parse(`<p:grpSp xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/><a:chOff x="0" y="0"/><a:chExt cx="1000" cy="1000"/></a:xfrm></p:grpSpPr><p:sp><p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="ellipse"/></p:spPr></p:sp><p:sp><p:spPr><a:xfrm><a:off x="110" y="140"/><a:ext cx="80" cy="50"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1800"/><a:t>关心</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp>`),node=elements(d,'sp')[1];
 assert.equal(centerLabelOnContainer(node,d.documentElement),true);assert.equal(first(node,'off').getAttribute('x'),'100');assert.equal(first(node,'off').getAttribute('y'),'100');assert.equal(first(node,'ext').getAttribute('cy'),'100');
});

test('两字两行标签在不改字号的前提下增高文字框并保持原中心',()=>{
 const d=wrap('<a:p><a:r><a:rPr sz="1800"/><a:t>工作</a:t></a:r></a:p>'),shape=d.documentElement;
 const beforeY=Number(first(shape,'off').getAttribute('y')),beforeH=Number(first(shape,'ext').getAttribute('cy'));
 assert.ok(fitTwoLineLabel(shape,18));const y=Number(first(shape,'off').getAttribute('y')),h=Number(first(shape,'ext').getAttribute('cy'));
 assert.ok(h>beforeH);assert.ok(Math.abs(y+h/2-beforeY-beforeH/2)<=1);assert.equal(first(shape,'rPr').getAttribute('sz'),'1800');
});

test('未提供照片时把样例人像转为可编辑图片框，保持位置、尺寸与对象ID',()=>{
 const d=parse(`<p:grpSp xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:pic><p:nvPicPr><p:cNvPr id="9" name="样例人像"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdOldPhoto"/></p:blipFill><p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="3000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr></p:pic></p:grpSp>`),before=serialize(first(d,'xfrm'));
 assert.equal(replaceExamplePhotos(d.documentElement,{color:'3764BF'}),1);assert.equal(elements(d,'pic').length,0);assert.equal(elements(d,'blip').length,0);assert.equal(first(d,'cNvPr').getAttribute('id'),'9');assert.equal(serialize(first(d,'xfrm')),before);assert.equal(first(d,'t').textContent,'照片待补充');assert.equal(first(d,'srgbClr').getAttribute('val'),'3764BF');
});

test('完整结束页沿用源背景与母版关系，不叠加BNA正文标题、导航和残留年份',async()=>{
 const base=await fs.readFile(new URL('../server/base.pptx',import.meta.url)),src=await openZip(base),order=await slideOrder(src),part=order.paths[0],w=order.width,h=order.height;
 src.file(part,`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="EDF2FC"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${textShape(2,'THANK YOU',1000000,2000000,9000000,1000000,50,'164C78',true)}</p:spTree></p:cSld></p:sld>`);
 const sourceBuffer=await src.generateAsync({type:'nodebuffer'}),component={id:'end',sourceId:'ending-source',sourceName:'ending.pptx',purpose:'ending',layout:true,sourceFullPage:true,width:w,height:h,part,slots:[{index:0,key:'shape:2',role:'label',required:true}],nativeObjects:1};
 const template={id:'bna',sourceId:'template',width:w,height:h,pages:[{}],theme:{font:'微软雅黑',primary:'002060',text:'202020'},bnaProfile:{coverPage:1,contentPage:1,bodyArea:{x:.03,y:.2,w:.94,h:.75}}};
 const s={title:'感谢聆听',kind:'ending',bullets:['感谢聆听'],materialSnapshot:component,materialBindings:[{slot:0,key:'shape:2',text:'感谢聆听',contentIds:['u1']}],blocks:[{id:'ignored',type:'text',text:'请批评指正2026年',role:'title',x:0,y:0,w:1,h:.1}]};
 const out=await composeDeck({title:'结束页验证',slides:[s]},template,[],{loadSource:async id=>id==='template'?base:sourceBuffer}),z=await openZip(out.buffer),p=await slideOrder(z),doc=parse(await z.file(p.paths[0]).async('string'));
 assert.deepEqual(elements(doc,'t').map(n=>n.textContent),['感谢聆听']);assert.equal(first(first(doc,'bg'),'srgbClr').getAttribute('val'),'EDF2FC');assert.equal(out.audit[0].fullSourcePage,true);
 assert.match(await z.file(p.paths[0].replace('/slides/','/slides/_rels/')+'.rels').async('string'),/slideLayout/);assert.equal(doc.documentElement.getAttribute('showMasterSp'),'0');
});
