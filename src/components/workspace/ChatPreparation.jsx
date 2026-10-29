import {SelectField} from '@/components/ui/select-field';
import React,{useState,useEffect,lazy,Suspense} from 'react';
import {Plus,ArrowUp,FileText,ChevronDown,SlidersHorizontal} from 'lucide-react';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {preparationIssues} from '@/lib/journey';
const PreparationSettings=lazy(()=>import('./Preparation'));

export default function ChatPreparation({s,onPlan,onOutline,stale,onSettings,onNewProject}){
 const [styles,setStyles]=useState([]);useEffect(()=>{api('/api/style-skills').then(v=>setStyles(v.items)).catch(()=>{});},[]);
 const [settings,setSettings]=useState(false),issues=preparationIssues(s),disabled=!!s.busy;
 return <section className="chat-preparation" aria-label="文档对话创作">
  <h1>这次准备讲什么？</h1><div className="project-composer-style"><label>版式<SelectField aria-label="创作版式Skill" value={s.styleSkillId} onChange={e=>s.setStyleSkillId(e.target.value)}>{styles.filter(i=>i.status==='ready').map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</SelectField></label><Button variant="ghost" size="sm" onClick={()=>s.setTab('styles')}>管理风格</Button></div>
  <Tabs value={s.inputMode||"document"} onValueChange={v=>s.setInputMode(v)} className="creation-input-mode"><TabsList><TabsTrigger value="document">文档生成</TabsTrigger><TabsTrigger value="topic">主题初稿</TabsTrigger></TabsList></Tabs>
  {s.inputMode==="topic"&&<p className="topic-draft-hint">先生成建议稿，具体事实、数据和来源待补充。</p>}
  <div className="home-chat-composer" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!disabled&&e.dataTransfer.files[0]){if(!s.workspaceFolderId)onNewProject?.(e.dataTransfer.files[0]);else void s.uploadDoc(e.dataTransfer.files[0]);}}}>
   {s.inputMode!=="topic"&&<Tabs defaultValue="paste"><TabsList><TabsTrigger value="paste">粘贴内容</TabsTrigger><TabsTrigger value="upload" onClick={()=>s.workspaceFolderId?s.docInput.current?.click():onNewProject?.()}>上传文档</TabsTrigger></TabsList></Tabs>}
   {s.inputMode!=="topic"&&s.docName&&<div className="home-document-chip"><FileText size={16}/><span>{s.docName}</span><small>{s.document.length.toLocaleString()} 字</small></div>}
   <textarea aria-label={s.inputMode==="topic"?"演示主题":"文档内容"} placeholder={s.inputMode==="topic"?"输入演示主题与大致方向，例如：企业数字化转型实施方案":"粘贴文档，或通过 + 上传文件…"} value={s.document} onChange={e=>s.setDocument(e.target.value)} maxLength={250000} disabled={disabled}/>
   <div className="home-composer-actions"><button type="button" aria-label="添加内容文档" disabled={disabled} onClick={()=>s.docInput.current?.click()}><Plus size={23}/></button><button type="button" className="home-requirements" aria-label="演示设置" onClick={()=>s.setSettings('presentation')}><SlidersHorizontal size={16}/></button><span/><button type="button" className="home-send" aria-label="生成逐页方案" title="生成逐页方案" disabled={disabled||issues.length>0} onClick={onPlan}><ArrowUp size={22}/></button></div>
  </div>
  {onOutline&&<div className="workbench-draft-action"><Button variant="outline" disabled={disabled} onClick={onOutline}><FileText size={16}/>查看页面方案</Button>{stale&&<span>内容已修改，方案需更新</span>}</div>}
  {s.document.length>=(s.inputMode==="topic"?2:20)&&issues.length>0&&<div className="home-preparation-hint">{issues.map(issue=><span key={issue}>{issue}</span>)}</div>}
 </section>;
}
