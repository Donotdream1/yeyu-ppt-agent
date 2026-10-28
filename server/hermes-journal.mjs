import {modelApiKey} from './model-connections.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {dataDir} from './library.mjs';
import {HERMES_SOURCE,hermesRuntimeStatus} from './hermes-client.mjs';
import {inspectNativePage} from './native-page-editor.mjs';
const sid=/^[a-f0-9-]{36}-p\d{1,2}$/i,uuid=/^[a-f0-9-]{36}$/i;
export async function listPageConversations({canAccess=async()=>true,rootId,page,q=''}={}){
 const items=[];for(const name of await fs.readdir(path.join(dataDir,'page-sessions')).catch(()=>[])){if(!sid.test(name.slice(0,-5))||!name.endsWith('.json'))continue;const root=name.slice(0,36);if(rootId&&root!==rootId||!await canAccess(root))continue;const s=JSON.parse(await fs.readFile(path.join(dataDir,'page-sessions',name),'utf8'));if(page&&s.page+1!==+page||!s.messages.length)continue;let title='演示稿';try{const state=JSON.parse(await fs.readFile(path.join(dataDir,'page-documents',root+'.json'),'utf8')),out=JSON.parse(await fs.readFile(path.join(dataDir,'outputs',state.headOutputId+'.json'),'utf8'));title=out.title||out.plan.title;}catch{}const last=s.messages.at(-1);if(q&&!((title+' '+s.messages.map(m=>m.content).join(' ')).toLowerCase().includes(q.toLowerCase())))continue;items.push({id:s.id,rootId:root,page:s.page+1,title,messages:s.messages.length,updatedAt:last.createdAt,lastMessage:last.content.slice(0,100),status:last.status||'saved'});}
 return {items:items.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,150)};
}
export async function readPageConversation(id){if(!sid.test(id))throw Error('无效页面记录');const s=JSON.parse(await fs.readFile(path.join(dataDir,'page-sessions',id+'.json'),'utf8'));return {id:s.id,rootId:s.rootId,page:s.page+1,messages:s.messages,uploads:s.uploads.map(({id,name,url})=>({id,name,url}))};}
export async function versionChanges(id,outputId){
 if(!uuid.test(outputId))throw Error('无效版本');const s=await readPageConversation(id);if(!s.messages.some(m=>m.outputId===outputId))throw Error('此版本不属于该页记录');
 const out=JSON.parse(await fs.readFile(path.join(dataDir,'outputs',outputId+'.json'),'utf8')),parent=JSON.parse(await fs.readFile(path.join(dataDir,'outputs',out.parentOutputId+'.json'),'utf8')),page=s.page-1;
 const [before,after]=await Promise.all([parent.id,out.id].map(async id=>inspectNativePage(await fs.readFile(path.join(dataDir,'outputs',id+'.pptx')),page)));
 return {outputId,parentOutputId:parent.id,page:s.page,beforePreview:'/api/previews/'+parent.id+'/'+s.page+'.png',afterPreview:'/api/previews/'+out.id+'/'+s.page+'.png',changes:after.shapes.filter(v=>v.type!=='group'&&JSON.stringify(v)!==JSON.stringify(before.shapes.find(b=>b.id===v.id))).map(v=>{const old=before.shapes.find(b=>b.id===v.id),textChanged=old?.text!==v.text;return {id:v.id,name:v.name,type:v.type,before:textChanged?old?.text||'':'',after:textChanged?v.text:'',summary:!old?'新增对象':textChanged?'文字内容已修改':'位置、尺寸或图形样式已调整',box:v.box};}),removed:before.shapes.filter(v=>!after.shapes.some(a=>a.id===v.id)).map(v=>({id:v.id,name:v.name,text:v.text}))};
}
const allowedTop=new Set(['README.md','README.zh-CN.md','LICENSE','run_agent.py','SOUL.md','agents/hermes_worker.py']);
export async function hermesFramework(){
 const files=[];async function walk(dir,relative='',depth=0){if(depth>2||files.length>180)return;for(const f of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[])){const rel=relative?relative+'/'+f.name:f.name;if(f.isDirectory()&&['agent','tools','skills','docs','hermes_cli'].includes(depth===0?f.name:relative.split('/')[0]))await walk(path.join(dir,f.name),rel,depth+1);else if(f.isFile()&&(allowedTop.has(rel)||/\.(md|py)$/.test(f.name)&&/^(agent|tools|skills|docs|hermes_cli)\//.test(rel)))files.push({path:rel,name:f.name});}}await walk(HERMES_SOURCE);
 return {name:'Hermes Agent',author:'Nous Research',github:'https://github.com/NousResearch/hermes-agent',documentation:'https://hermes-agent.nousresearch.com/docs/',license:'MIT',runtime:await hermesRuntimeStatus(),files:files.sort((a,b)=>Number(allowedTop.has(b.path))-Number(allowedTop.has(a.path))||a.path.localeCompare(b.path)).slice(0,180),features:[{name:'Agent循环',detail:'读取任务、调用受限工具、检查结果并提交版本。'},{name:'Skills',detail:'按任务加载撰写、图表、素材、版式与审校规范。'},{name:'会话与记录',detail:'本系统按演示稿和页码保存对话、工具事件与版本。'}],integration:'本机已接入Hermes AIAgent；本页呈现本系统实际使用的能力。上游其他能力不表示本系统已启用。'};
}
export async function frameworkFile(file){
 if(typeof file!=='string'||file.includes('..')||file.includes('\\')||file.startsWith('/')||file.includes(':')||!(/\.(md|py)$/.test(file)||file==='LICENSE')||!(allowedTop.has(file)||/^(agent|tools|skills|docs|hermes_cli)\//.test(file)))throw Error('只能查看公开框架源码与文档');
 const filename=path.join(HERMES_SOURCE,file),realRoot=await fs.realpath(HERMES_SOURCE),realFile=await fs.realpath(filename);if(!realFile.startsWith(realRoot+path.sep))throw Error('框架文件超出源码目录');const stat=await fs.stat(filename);if(stat.size>150000)throw Error('文件较大，请在GitHub查看');let content=await fs.readFile(filename,'utf8');if(modelApiKey())content=content.split(modelApiKey()).join('[hidden]');return {path:file,content,url:'https://github.com/NousResearch/hermes-agent/blob/main/'+file};
}
