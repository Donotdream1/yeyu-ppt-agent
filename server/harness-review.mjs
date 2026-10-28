import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {HERMES_PYTHON} from './hermes-client.mjs';
import {researchPageErrors,RESEARCH_PROFILE} from './research-profile.mjs';

export const PROJECT_SKILLS=['ppt-writing','chart-drawing','material-use','layout-review','harness-review','presentation-style','research-defense-layout'];
export async function auditProjectSkills(){
 const checks=[];
 for(const name of PROJECT_SKILLS){const root=path.resolve('agents/skills',name),content=await fs.readFile(path.join(root,'SKILL.md'),'utf8'),issues=[];if(!content.startsWith('---')||!new RegExp('name:\\s*'+name).test(content))issues.push('技能名称或文件头无效');if(!/description:/.test(content))issues.push('缺少用途说明');for(const match of content.matchAll(/\]\((references\/[^)#]+)\)/g))try{await fs.access(path.join(root,match[1]));}catch{issues.push('缺少引用 '+match[1]);}checks.push({name,passed:!issues.length,issues});}
 return {passed:checks.every(c=>c.passed),skills:checks,source:{repository:'https://github.com/yb2460/harness-anything',commit:'e1924f8499ad6aaa11c579d5492205cfaa89c5d6',adapter:'harness-review',upstreamSkill:'cli-anything-wps'},conflictPolicy:'用户参考规范与明确选色优先；保留原生编辑；不关闭用户Office进程'};
}
function upstreamCheck(slides){return new Promise((resolve,reject)=>{const child=spawn(HERMES_PYTHON,[path.resolve('agents/harness_inspect.py')],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},stdio:['pipe','pipe','pipe']});let output='';child.stdout.setEncoding('utf8');child.stdout.on('data',s=>output+=s);const timer=setTimeout(()=>{child.kill();reject(Error('Harness 规则检查超时'));},20000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);if(code)return reject(Error('Harness 原始诊断未完成'));try{resolve(JSON.parse(output));}catch{reject(Error('Harness 诊断格式无效'));}});child.stdin.end(JSON.stringify({slides}));});}
export async function reviewWithHarness(plan,{rendered=false,textFit}={}){
 const skillAudit=await auditProjectSkills(),errors=[],warnings=[],academic=plan.designProfile==='research-defense';
 for(const [i,s]of plan.slides.entries()){
  if(academic)for(const error of researchPageErrors(s,plan.sourceText||''))errors.push({page:i+1,message:error});
  if(!s.blocks?.length)errors.push({page:i+1,message:'尚未生成原生布局'});
  if(s.layoutReview?.sourceObjects!==s.layoutReview?.retainedObjects)errors.push({page:i+1,message:'选定素材对象未完整保留'});
 }
 const slides=plan.slides.map(s=>(s.blocks||[]).map(b=>({type:b.type==='text'?'text':b.type==='component'?'image':b.type==='shape'?'box':b.type,role:['main-title','title'].includes(b.role)?'title':['supplement','page','figure-caption'].includes(b.role)?'caption':'body',fs:b.fontSize||14})));
 let raw;try{raw=await upstreamCheck(slides);}catch(e){warnings.push(e.message);}
 return {passed:skillAudit.passed&&!errors.length,errors,warnings,skillAudit,framework:'Harness Anything 五维框架，按用户规范适配',upstreamDiagnostic:raw?.upstream,upstreamDiagnosticPolicy:academic?'保留上游默认字号诊断，不用商务36/24pt阈值否定用户32/14pt科研规范':'按所选素材与明确用户参数执行',dimensions:{visual:{status:errors.length?'issues':'rule_checked',referenceImage:'not_provided',scope:academic?'骨架、层级、配色来源与直角模块':'素材对象与已选版式'},pedagogy:{status:'requires_human_review',scope:'语义与叙事由原文、技能及人工检查共同确认，不自动打高分'},proofreading:{status:textFit==='checked'?'powerpoint_checked':'preflight_pending'},parity:{status:rendered?'pptx_png_available':'not_run',pdf:'not_requested'},substance:{status:errors.some(e=>/依据|原文|数据/.test(e.message))?'issues':'source_checks_passed',scope:'来源摘录和既有图表数据校验，不代表逐句蕴含证明'}},parameters:academic?RESEARCH_PROFILE:undefined};
}
