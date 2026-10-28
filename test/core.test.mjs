import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createDeck,openZip,slideOrder,slideInfo,fillSlide,parse,elements,resolvePart,relPath,NS} from '../server/ooxml.mjs';
import {planDeck,requestSchema,demoPlan} from '../server/planner.mjs';
import {builtinAssets,matchAsset,readLibrary,sourceBuffer} from '../server/library.mjs';
import {extractDocument} from '../server/documents.mjs';

const input=requestSchema.parse({document:'项目背景：资料分散。当前进展：已完成文档导入。下一阶段：收集反馈并完善检索。',pageCount:5,mode:'demo'});
const s={title:'项目进展',subtitle:'',kind:'content',bullets:['文档导入已完成','接下来收集试用反馈'],notes:'完整说明',assetId:'builtin-content'};
async function verifyPackage(buffer){
  const z=await openZip(buffer),order=await slideOrder(z);
  for(const file of Object.values(z.files).filter(x=>!x.dir&&x.name.endsWith('.rels'))){
    const parent=file.name==='_rels/.rels'?'':file.name.replace(/_rels\/([^/]+)\.rels$/,'$1');
    for(const n of elements(parse(await file.async('string')),'Relationship')){
      if(n.getAttribute('TargetMode')==='External')continue;
      const p=resolvePart(parent,n.getAttribute('Target'));
      assert.ok(z.file(decodeURI(p))||z.file(p),`缺失依赖 ${file.name} -> ${p}`);
    }
  }
  return {z,order};
}
test('基础 PPTX 的所有关系完整，文字与备注可编辑',async()=>{
  const out=await createDeck([s],builtinAssets,()=>{});
  const {z,order}=await verifyPackage(out.buffer);assert.equal(order.paths.length,1);
  const xml=await z.file(order.paths[0]).async('string');assert.match(xml,/文档导入已完成/);assert.match(await z.file('ppt/notesSlides/notesSlide1.xml').async('string'),/完整说明/);
});
test('只读取主幻灯片列表，忽略 section 扩展中的同名 sldId',async()=>{
  const {buffer}=await createDeck([s],builtinAssets,()=>{});const z=await openZip(buffer);
  let xml=await z.file('ppt/presentation.xml').async('string');xml=xml.replace('</p:presentation>','<p:extLst><p:ext uri="test"><x:section xmlns:x="urn:test"><x:sldId id="256"/></x:section></p:ext></p:extLst></p:presentation>');z.file('ppt/presentation.xml',xml);
  assert.equal((await slideOrder(z)).paths.length,1);
});
test('跨文本 run 的占位符可替换，特殊字符正确转义',async()=>{
  const {buffer}=await createDeck([{...s,title:'{{title}}',bullets:['{{body}}']}],builtinAssets,()=>{});const z=await openZip(buffer);
  const xml=(await z.file('ppt/slides/slide1.xml').async('string')).replace('<a:t>{{title}}</a:t>','<a:t>{{ti</a:t></a:r><a:r><a:t>tle}}</a:t>');
  const out=fillSlide(xml,{...s,title:'研发 & 产品 <协作>'},1);assert.match(slideInfo(out.xml).text,/研发 & 产品 <协作>/);assert.doesNotMatch(out.xml,/\{\{title\}\}/);
});
test('自动匹配避开含原始数据的图表与表格',()=>{
  const risky={...builtinAssets[1],id:'chart',builtin:false,charts:1,text:'项目进展 文档导入',width:12192000,height:6858000};
  assert.notEqual(matchAsset(s,[risky,...builtinAssets]).id,'chart');
});
test('替换模板文字后，自动适应方式只能保留一个，防止 PowerPoint 拒绝打开',async()=>{
  const {buffer}=await createDeck([{...s,title:'{{title}}',bullets:['{{body}}']}],builtinAssets,()=>{});const z=await openZip(buffer);
  const xml=(await z.file('ppt/slides/slide1.xml').async('string')).replaceAll('<a:normAutofit/>','<a:spAutoFit/>');
  const result=fillSlide(xml,s,1),doc=parse(result.xml);
  for(const body of elements(doc,'bodyPr'))assert.ok(elements(body,'normAutofit').length+elements(body,'spAutoFit').length+elements(body,'noAutofit').length<=1);
});
test('人工文字槽标注优先于推断，清除示例文字并准确放入标题和正文',async()=>{
  const {buffer}=await createDeck([s],builtinAssets,()=>{}),z=await openZip(buffer);
  const xml=await z.file('ppt/slides/slide1.xml').async('string');
  const result=fillSlide(xml,{...s,title:'准确标题',bullets:['准确正文']},1,{titleIndex:1,subtitleIndex:-1,bodyIndices:[3],clearOtherText:true});
  const texts=slideInfo(result.xml).shapes.map(s=>s.text);assert.equal(texts[1],'准确标题');assert.equal(texts[3],'准确正文');assert.equal(texts[0],'');
});
test('DOCX 正文可以提取为纯文本',async()=>{
  const {default:JSZip}=await import('jszip');const z=new JSZip();
  z.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+input.document+'</w:t></w:r></w:p></w:body></w:document>');
  assert.match((await extractDocument(await z.generateAsync({type:'nodebuffer'}),'测试.docx')).text,/文档导入/);
});
test('含文字层的 PDF 可以提取，支持真实文档上传链路',async()=>{
  const strings=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream='BT /F1 16 Tf 50 700 Td (Project progress and document import completed.) Tj ET';strings.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf='%PDF-1.4\n',offsets=[0];strings.forEach((v,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${v}\nendobj\n`;});const start=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  assert.match((await extractDocument(Buffer.from(pdf),'测试.pdf')).text,/Project progress/);
});
test('演示模式准确生成指定页数，不需要密钥',async()=>{
  const p=await planDeck(input);assert.equal(p.slides.length,5);assert.match(p.engine,/演示/);
});
test('DeepSeek 请求使用官方端点、JSON 输出，验证返回页数',async()=>{
  let request;
  const req={...input,mode:'deepseek',apiKey:'fake-test-secret',model:'deepseek-flash'};
  const out=await planDeck(req,{fetchImpl:async(url,init)=>{request={url,init};return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(demoPlan(input))}}]})};}});
  assert.equal(out.slides.length,5);assert.equal(request.url,'https://api.deepseek.com/chat/completions');
  assert.equal(JSON.parse(request.init.body).response_format.type,'json_object');assert.ok(!request.init.body.includes('fake-test-secret'));
  await assert.rejects(()=>planDeck(req,{fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({title:'错误页数',slides:[s]})}}]})})}),/页不一致/);
});
test('文本解析支持 UTF-8，拒绝无文字或不支持的文件',async()=>{
  const out=await extractDocument(Buffer.from(input.document),'项目.txt');assert.equal(out.text,input.document);
  await assert.rejects(()=>extractDocument(Buffer.from('abc'),'短文.txt'),/不足/);
  await assert.rejects(()=>extractDocument(Buffer.from('abc'),'文件.exe'),/支持/);
});
test('真实素材：跨页复用保留图片、母版、图表与嵌入工作簿的关系',async t=>{
  const db=await readLibrary();if(!db.assets.length){t.skip('没有本地素材');return;}
  const normal=db.assets.find(a=>a.images&&!a.charts&&!a.tables),chart=db.assets.find(a=>a.charts);
  const sourceBytes=await sourceBuffer(normal.sourceId);const before=await openZip(sourceBytes);
  const out=await createDeck([{...s,assetId:normal.id},{...s,assetId:chart.id},{...s,assetId:normal.id}],db.assets,sourceBuffer);
  const {z,order}=await verifyPackage(out.buffer);assert.equal(order.paths.length,3);assert.equal(new Set(order.paths).size,3);
  const importedChart=Object.keys(z.files).find(n=>n.startsWith('imports/')&&/\/charts\/chart\d+\.xml$/.test(n));assert.ok(importedChart);
  const originalName=importedChart.split('/').slice(2).join('/');assert.equal(await z.file(importedChart).async('string'),await before.file(originalName).async('string'));
  assert.ok(Object.keys(z.files).some(n=>n.includes('/embeddings/')));assert.ok(out.warnings.some(x=>x.includes('原始数据')));
  await fs.mkdir('test-output',{recursive:true});await fs.writeFile('test-output/真实素材集成测试.pptx',out.buffer);
});
