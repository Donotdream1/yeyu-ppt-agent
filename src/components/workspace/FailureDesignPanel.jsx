import {SelectField} from '@/components/ui/select-field';
import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ZoomIn } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import SlideImage from './SlideImage';

export default function FailureDesignPanel({ s, page, onPageChange }) {
 const [data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[selected,setSelected]=useState(''),[reload,setReload]=useState(0),[zoom,setZoom]=useState(false);
 const id=s.jobSnapshot?.id,busy=s.resuming||!!s.busy;
 useEffect(()=>{setSelected('');setQuery('');},[id,page]);
 useEffect(()=>{
  if(!id)return;const controller=new AbortController();let cancelled=false;
  setLoading(true);setError('');
  const timer=setTimeout(()=>api(`/api/jobs/${id}/recovery?${new URLSearchParams({...(page?{page:String(page)}:{}),q:query})}`,{signal:controller.signal}).then(value=>{if(!cancelled){setData(value);setSelected(old=>value.items.some(c=>c.id===old&&c.selectable)?old:'');}}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);}),180);
  return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
 },[id,page,query,reload]);
 const choice=data?.items.find(c=>c.id===selected),failed=data?.failedPages||s.jobSnapshot?.progress?.failedPages||[];
 return <Card className="failure-design-panel" aria-label="失败页人工选版">
  <CardHeader>
   <Badge variant="secondary">人工接入 · 已保存制作进度</Badge>
   <CardTitle>为未完成页面选择设计</CardTitle>
   <CardDescription>选择素材后，只重新填写这一页，再继续检查和导出。</CardDescription>
  </CardHeader>
  <CardContent>
   {failed.length>0&&<label className="recovery-page-select">处理页面<SelectField aria-label="选择待处理页面" value={page||data?.page.number||failed[0]?.page} onChange={e=>onPageChange(Number(e.target.value))}>{failed.map(p=><option key={p.page} value={p.page}>第 {p.page} 页{p.title?' · '+p.title:''}</option>)}</SelectField></label>}
   {data&&<div className="recovery-page-brief"><strong>第 {data.page.number} 页 · {data.page.title}</strong><p>{failed.find(p=>p.page===data.page.number)?.reason}</p><ul>{data.page.bullets.map((text,i)=><li key={i}>{text}</li>)}</ul><span>{data.completedPages.length} 页已完成并保留 · 共 {data.totalPages} 页</span></div>}
   <Input aria-label="搜索可替换设计" placeholder="搜索素材名称或来源页码" value={query} onChange={e=>setQuery(e.target.value)} disabled={busy}/>
   <div className="recovery-list-heading"><span>{loading?'正在检查可用设计':`可替换设计 · ${data?.items.length||0} 个`}</span><Button variant="ghost" size="sm" aria-label="刷新设计列表" onClick={()=>setReload(v=>v+1)} disabled={busy||loading}><RefreshCw size={15}/></Button></div>
   {error&&<div role="alert" className="recovery-panel-error"><AlertCircle size={16}/><p>{error}</p></div>}
   {loading?<div role="status" className="recovery-loading"><Loader2 className="animate-spin" size={20}/>正在读取素材与重排结果</div>:<div className="recovery-design-grid">{data?.items.map(c=><button type="button" key={c.id} className={`recovery-design-card ${selected===c.id?'selected':''}`} aria-label={`选择设计：${c.sourceName} 第${c.sourcePage}页`} aria-pressed={selected===c.id} disabled={busy||!c.selectable} onClick={()=>setSelected(c.id)}>
    <div className="recovery-thumbnail"><SlideImage src={c.previewUrl} alt={`${c.sourceName} 第${c.sourcePage}页素材预览`}/>{selected===c.id&&<CheckCircle2 size={21}/>}</div>
    <strong>第 {c.sourcePage} 页 · {c.recipe==='reflow'?'安全重排':c.selectable?'原生版式':'暂不可用'}</strong><span>{c.sourceName}</span><small>{!c.selectable?c.reason:c.warnings?.length?c.warnings.join('；'):`${c.slots} 个文字位置 · 可编辑`}</small>
   </button>)}</div>}
   {!loading&&data&&!data.items.length&&<p className="recovery-empty">{data.note}</p>}
   {choice&&<div className="recovery-choice"><strong>已选：{choice.sourceName} 第 {choice.sourcePage} 页</strong><p>{choice.recipe==='reflow'?'按用户模板安全重排，保留原生图形与原色。':'沿用素材构图，按本页内容重新撰写文字。'}</p>{choice.warnings?.map(w=><p key={w}>{w}</p>)}<Button variant="outline" size="sm" onClick={()=>setZoom(true)}><ZoomIn/>放大查看素材</Button></div>}
   {!loading&&data&&!query.trim()&&!data.items.some(c=>c.selectable)&&<Button variant="outline" disabled={busy} onClick={()=>s.resumeJob()}><RefreshCw/>自动重组模板并继续</Button>}
   <Button className="recovery-continue" disabled={!choice?.selectable||loading||busy} onClick={()=>s.resumeJob({page:data.page.number,materialId:choice.id,recipe:choice.recipe,revision:data.revision})}>{busy?<Loader2 className="animate-spin"/>:<RefreshCw/>}使用此设计并继续</Button>
   <p className="recovery-help">素材图中的旧文字仅作版式预览，继续时会替换为你的内容。若再次检查未通过，可在这里重选设计。</p>
  </CardContent>
  <Dialog open={zoom} onOpenChange={setZoom}><DialogContent className="recovery-zoom"><DialogHeader><DialogTitle>素材设计预览</DialogTitle><DialogDescription>{choice?.sourceName} · 第 {choice?.sourcePage} 页</DialogDescription></DialogHeader>{choice&&<SlideImage src={choice.previewUrl} alt="选中的原生素材设计"/>}</DialogContent></Dialog>
 </Card>;
}
