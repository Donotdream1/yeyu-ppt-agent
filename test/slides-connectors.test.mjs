import test from 'node:test';
import assert from 'node:assert/strict';
import {exportGoogleSlides,exportLarkSlides} from '../server/slides-connectors.mjs';
const json=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
test('Google exports a native Slides copy, rejects foreign upload URLs and does not set sharing permissions',async()=>{
 const calls=[],buffer=Buffer.from('fixture'),token='test-only-access-token';
 const result=await exportGoogleSlides({buffer,title:'Test',token},{fetchImpl:async(url,options)=>{calls.push({url,options});return calls.length===1?new Response(null,{headers:{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test'}}):json({id:'test_123'});}});
 assert.equal(result.ready,true);assert.match(result.url,/docs.google.com\/presentation/);assert.equal(JSON.parse(calls[0].options.body).mimeType,'application/vnd.google-apps.presentation');assert.equal(calls[1].options.body,buffer);assert.equal(calls.length,2);assert.ok(!JSON.stringify(result).includes(token));
 await assert.rejects(exportGoogleSlides({buffer,title:'x',token},{fetchImpl:async()=>new Response(null,{headers:{location:'https://evil.example/upload'}})}),/地址无效/);
});
test('Lark upload/import separates pending task from completed Slides and resumes without duplicate upload',async()=>{
 const calls=[],input={buffer:Buffer.from('fixture'),title:'Test',token:'test-only-access-token'},responses=[{file_token:'file_1'},{ticket:'ticket_1'},{result:{job_status:2}}];
 const pending=await exportLarkSlides(input,{fetchImpl:async(url,options)=>{calls.push({url,options});return json({code:0,data:responses.shift()});}});assert.equal(pending.ready,false);assert.equal(pending.ticket,'ticket_1');assert.equal(calls[0].options.body.get('parent_type'),'ccm_import_open');assert.equal(JSON.parse(calls[1].options.body).type,'slides');
 let queries=0;const done=await exportLarkSlides({...input,buffer:null,ticket:pending.ticket},{fetchImpl:async()=>{queries++;return json({code:0,data:{result:{job_status:0,token:'slide_1',url:'https://example.feishu.cn/slides/slide_1'}}});}});assert.equal(done.ready,true);assert.equal(queries,1);assert.match(done.url,/feishu.cn/);
 await assert.rejects(exportLarkSlides({...input,buffer:Buffer.alloc(21*1024*1024)}),/20MB/);
 await assert.rejects(exportLarkSlides({...input,ticket:'../etc'}),/任务编号无效/);
});
