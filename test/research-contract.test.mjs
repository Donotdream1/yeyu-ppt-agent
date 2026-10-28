import test from 'node:test';
import assert from 'node:assert/strict';
import {researchPageErrors} from '../server/research-profile.mjs';
import {parse,first,elements,textShape,NS} from '../server/ooxml.mjs';
import {styleNativeText} from '../server/native-primitives.mjs';
const evidence='现场反馈驱动模型库持续优化。';
const page={title:'技术路线',research:{layout:'technical-route',viewpoint:'分工协同',contentTitle:'核心技术路线',conclusion:'持续优化',conclusionEvidence:[evidence]}};
test('科研路线拒绝错误字段和超容量，防止未呈现的模块静默丢失',()=>{
 assert.match(researchPageErrors({...page,research:{...page.research,layers:[{title:'错误字段'}]}},evidence).join(''),/modules/);
 const module={title:'模型层',steps:[{title:'封装',body:'保留算法'}]};
 assert.deepEqual(researchPageErrors({...page,research:{...page.research,modules:[module]}},evidence),[]);
 assert.match(researchPageErrors({...page,research:{...page.research,modules:Array(5).fill(module)}},evidence).join(''),/拆页/);
 assert.match(researchPageErrors({...page,research:{...page.research,modules:[{...module,steps:Array(4).fill({title:'步骤'})}]}},evidence).join(''),/最多3/);
});
test('科研原生文字明确字号、段前后间距和缩进，防止继承母版造成被迫缩字',()=>{
 const node=parse(`<root xmlns:p="${NS.p}" xmlns:a="${NS.a}">${textShape(2,'章节',0,0,1000000,1000000,32)}</root>`).documentElement.firstChild;
 styleNativeText(node,{id:'chapter',role:'chapter',fontSize:32,bold:true},{academic:true});
 for(const key of ['rPr','endParaRPr'])for(const prop of elements(node,key))assert.equal(prop.getAttribute('sz'),'3200');
 const p=first(node,'pPr');assert.equal(p.getAttribute('marL'),'0');assert.equal(p.getAttribute('hangingPunct'),'0');assert.deepEqual(elements(p,'spcPts').map(n=>n.getAttribute('val')),['0','0']);
});
