import React,{useEffect,useState} from 'react';
import {Wand2,Download,RefreshCw,Check,Loader2} from 'lucide-react';
import {api,post} from '@/lib/api';
import {accountStorage} from '@/lib/account-storage';
import {useAuth} from '@/components/AuthGate';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {SelectField} from '@/components/ui/select-field';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import SlideImage from './SlideImage';
import './template-builder.css';

export default function AITemplateBuilder({s,onSaved}){
 const store=accountStorage(useAuth()?.user),[open,setOpen]=useState(false),[job,setJob]=useState(null),[name,setName]=useState('我的可复用模板'),[requirements,setRequirements]=useState(''),[count,setCount]=useState(6),[templateId,setTemplateId]=useState(s.templateId||''),[sourceId,setSourceId]=useState(''),[sources,setSources]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=job?.status==='running';
 useEffect(()=>{const id=store.getItem('template-generation-active');if(id)api('/api/template-generations/'+id).then(setJob).catch(()=>store.removeItem('template-generation-active'));},[]);
 useEffect(()=>{if(!open)return;let live=true;api('/api/design-options').then(v=>{if(live)setSources(v.sources||[]);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[open]);
 useEffect(()=>{if(!active)return;const timer=setInterval(()=>{api('/api/template-generations/'+job.id).then(setJob).catch(e=>setError(e.message));},1800);return()=>clearInterval(timer);},[job?.id,active]);
 async function run(fn){setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function generate(){await run(async()=>{const result=await post('/api/template-generations',{name,requirements,layoutCount:Number(count),templateId:templateId||undefined,paletteSourceId:sourceId||undefined,audience:s.audience||'领导汇报',apiKey:s.apiKey,model:s.model});store.setItem('template-generation-active',result.id);setJob(result);});}
 return <><Button variant="outline" onClick={()=>setOpen(true)}><Wand2 size={16}/>{active?'模板生成中':'AI生成模板'}</Button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="template-builder-dialog"><DialogHeader><DialogTitle>根据需求生成可复用模板</DialogTitle><DialogDescription>Hermes 从素材库重组可编辑组件，保留原色、原字号。生成后预览并保存。</DialogDescription></DialogHeader>
   <div className="template-builder-scroll">
    {!job&&<><label>模板名称<Input aria-label="AI模板名称" value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label>
     <label>用途与版式需求<Textarea aria-label="AI模板需求" value={requirements} onChange={e=>setRequirements(e.target.value)} maxLength={8000} rows={5} placeholder="例如：用于团委年度工作汇报，需要目录、三项重点工作、活动流程、成果对比和结束页；沿用素材的颜色，保留照片位置。"/></label>
     <div className="template-builder-fields"><label>机构底稿<SelectField aria-label="AI模板机构底稿" value={templateId} onValueChange={setTemplateId}><option value="">沿用当前底稿</option><option value="material-library">从素材库设计整套模板</option>{s.studio.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</SelectField></label><label>版式数量<SelectField aria-label="AI模板版式数量" value={count} onValueChange={setCount}>{Array.from({length:9},(_,i)=><option value={i+4} key={i}>{i+4} 页（含封面、目录、结束页）</option>)}</SelectField></label></div>
     <label>配色素材套系<SelectField aria-label="AI模板素材套系" value={sourceId} onValueChange={setSourceId}><option value="">AI按需求选择，保留素材原色</option>{sources.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</SelectField></label><Button disabled={busy||!name.trim()||requirements.trim().length<5} onClick={()=>void generate()}>{busy?<Loader2 className="animate-spin"/>:<Wand2/>}生成模板</Button></>}
    {job&&<><div className="template-builder-progress" role="status">{active&&<Loader2 size={16} className="animate-spin"/>}<strong>{job.phase}</strong><span>{job.completedPages} / {job.layoutCount} 页</span></div><progress aria-label="模板生成进度" value={job.completedPages} max={job.layoutCount}/>
     <div className="template-builder-pages">{job.pages.map(p=><article key={p.page}>{p.preview&&<SlideImage src={p.preview} alt={'模板第'+p.page+'页 '+p.title}/>}<div><strong>{String(p.page).padStart(2,'0')} · {p.title}</strong><span>{p.complete?'已填充':'待制作'}</span></div><p>{p.usage}</p><details><summary>选用理由</summary><p>{p.reason}</p></details></article>)}</div>
     {job.error&&<p role="alert">{job.error}</p>}
     {job.validation&&!job.validation.nativeTextChecked&&<p className="template-builder-hint">尚未完成 Office 原生文字检查，保存后为草稿；可重试检查。</p>}
     {job.validation&&!job.validation.previewReady&&<p className="template-builder-hint">全页预览尚未完成，可下载PPT查看或重试。</p>}
     <div className="dialog-actions">{job.fileUrl&&<Button variant="outline" asChild><a href={job.fileUrl}><Download size={15}/>下载模板PPT</a></Button>}{['review','failed'].includes(job.status)&&<Button variant="outline" disabled={busy} onClick={()=>void run(async()=>setJob(await post('/api/template-generations/'+job.id+'/resume',{apiKey:s.apiKey,model:s.model})))}><RefreshCw size={15}/>{job.status==='failed'?'从断点继续':'重试检查'}</Button>}{job.status==='review'&&<Button disabled={busy} onClick={()=>void run(async()=>{const card=await post('/api/template-generations/'+job.id+'/save',{});setJob(await api('/api/template-generations/'+job.id));onSaved(card);setOpen(false);})}><Check size={15}/>{job.validation?.nativeTextChecked&&job.validation?.previewReady?'保存为可复用模板':'保存模板草稿'}</Button>}{!active&&<Button variant="ghost" disabled={busy} onClick={()=>{store.removeItem('template-generation-active');setJob(null);setError('');}}>新建另一套</Button>}</div>
    </>}
    {error&&<p role="alert">{error}</p>}
   </div>
  </DialogContent></Dialog>
 </>;
}
