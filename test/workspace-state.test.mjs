import test from 'node:test';
import assert from 'node:assert/strict';
import {preparationKey,preparationIssues} from '../src/lib/journey.js';
test('修改文档、模板、数据或规则会使旧方案失效，输入Key不会进入方案签名',()=>{
 const base={document:'完整的用户文档内容',templateId:'template-a',paletteMode:'material',apiKey:'secret',dataFiles:[{sha256:'a'}]};
 const key=preparationKey(base);assert.ok(!key.includes('secret'));
 for(const changes of [{document:'新文档'},{templateId:'template-b'},{dataFiles:[{sha256:'b'}]},{presentationPrompt:'新规则'},{requirements:'新需求'}])assert.notEqual(preparationKey({...base,...changes}),key);
 assert.equal(preparationKey({...base,userColors:{primary:'ff0000'}}),key);
 assert.notEqual(preparationKey({...base,paletteMode:'user',userColors:{primary:'ff0000'}}),key);
});
test('进入规划前需准备真实文档、模板和模型配置',()=>{
 assert.equal(preparationIssues({}).length,3);
 const complete={document:'这是一份完整的工作文档，用于验证内容、模板和模型的准备条件。',templateId:'a',studio:{hasKey:true}};
 assert.deepEqual(preparationIssues(complete),[]);assert.deepEqual(preparationIssues({...complete,studio:{},apiKey:'session-key'}),[]);
});
