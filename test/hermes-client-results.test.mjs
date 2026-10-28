import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptedToolPages} from '../server/hermes-client.mjs';

test('发布结果pages为页数时记录日志不崩溃，也不把页数当作页号',()=>{
 const result={id:'output',pages:11,url:'/api/files/output.pptx'};
 assert.doesNotThrow(()=>acceptedToolPages(result));assert.equal(acceptedToolPages(result),undefined);
 assert.deepEqual(JSON.parse(JSON.stringify({acceptedPages:acceptedToolPages(result),ok:true})),{ok:true});assert.equal(result.pages,11);
});
test('逐页结果仅记录通过的合法页号，失败项及异常成员不误报成功',()=>{
 const result={pages:[{page:1,ok:true},{page:2,ok:false},{page:3,issues:['未填充']},{page:4,error:'失败'},{page:5},null,6,{page:'7'},{}]};
 assert.deepEqual(acceptedToolPages(result),[1,5]);assert.deepEqual(acceptedToolPages({pages:[]}),[]);
});
test('空结果及字符串、对象、零页数不触发数组方法',()=>{
 for(const result of [undefined,null,{}, {pages:0},{pages:'11'},{pages:{total:11}}])assert.equal(acceptedToolPages(result),undefined);
});
