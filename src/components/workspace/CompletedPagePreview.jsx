import React, {useEffect,useState} from 'react';
import {RefreshCw,Loader2,ZoomIn} from 'lucide-react';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import SlideImage from './SlideImage';

export default function CompletedPagePreview({job}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0),[selected,setSelected]=useState(0),[zoom,setZoom]=useState(false);
 const id=job?.id,status=job?.status;
 useEffect(()=>{
  if(!id)return;let cancelled=false,timer;const controller=new AbortController();setLoading(true);setError('');
  const read=async(start=false)=>{
   try{const value=await api(`/api/jobs/${id}/previews`,{...(start?{method:'POST',body:JSON.stringify({})}:{}),signal:controller.signal});if(cancelled)return;setData(value);setLoading(false);if(value.status==='rendering')timer=setTimeout(()=>read(),4000);}
   catch(e){if(!cancelled){setError(e.message);setLoading(false);}}
  };
  read(status==='failed'||refresh>0);
  return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
 },[id,status,refresh]);
 useEffect(()=>{setData(null);setSelected(0);},[id]);
 const pages=data?.status==='ready'?data.pages:[],current=pages.find(p=>p.page===selected)||pages[0],rendering=data?.status==='rendering';
 return <Card className="production-preview" aria-label="已生成页面实际效果">
  <CardHeader><div className="stage-preview-heading"><CardTitle>已生成页面 · 实际效果</CardTitle><Button variant="outline" size="sm" disabled={loading||rendering||!id} onClick={()=>setRefresh(n=>n+1)}><RefreshCw className={loading||rendering?'animate-spin':''} size={15}/>{pages.length?'刷新页面效果':'查看已完成页面'}</Button></div><CardDescription>展示已填写文案与用户模板组合后的实际页面。阶段预览还会经过最终文字和布局检查。</CardDescription></CardHeader>
  <CardContent>
   {(loading||rendering)&&<p className="stage-preview-message" role="status"><Loader2 className="animate-spin" size={18}/>正在生成实际页面预览，制作进度会继续保存。</p>}
   {(error||data?.status==='failed')&&<p role="alert" className="stage-preview-message">{error||data.message}，可稍后点击刷新预览；已保存页面不受影响。</p>}
   {!loading&&!rendering&&!pages.length&&!error&&data?.status!=='failed'&&<p className="stage-preview-message">{data?.message||'页面填写完成后，点击“查看已完成页面”即可检查效果。'}</p>}
   {current&&<><div className="stage-preview-title"><strong>第 {current.page} 页 · {current.title}</strong><span>{current.needsReview?'待调整':'阶段预览'}</span><Button variant="ghost" size="sm" onClick={()=>setZoom(true)}><ZoomIn size={16}/>放大查看</Button></div><button type="button" className="stage-preview-canvas" aria-label={`放大查看第${current.page}页实际效果`} onClick={()=>setZoom(true)}><SlideImage src={current.url} alt={`第${current.page}页实际生成效果`}/></button><div className="stage-preview-thumbnails">{pages.map(p=><button key={p.page} type="button" aria-label={`查看第${p.page}页实际效果`} aria-pressed={current.page===p.page} className={current.page===p.page?'selected':''} onClick={()=>setSelected(p.page)}><SlideImage src={p.url} alt={`第${p.page}页缩略图`}/><span>第 {p.page} 页{p.needsReview?' · 待调整':''}</span></button>)}</div></>}
  </CardContent>
  <Dialog open={zoom} onOpenChange={setZoom}><DialogContent className="recovery-zoom"><DialogHeader><DialogTitle>第 {current?.page} 页 · 实际生成效果</DialogTitle><DialogDescription>{current?.title} · 最终交付前还会检查文字边界与布局</DialogDescription></DialogHeader>{current&&<SlideImage src={current.url} alt="当前页面实际效果"/>}</DialogContent></Dialog>
 </Card>;
}
