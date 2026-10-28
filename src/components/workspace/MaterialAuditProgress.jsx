import React,{useEffect,useState,useRef} from 'react';
import {Eye,Loader2,CheckCircle2,RefreshCw,ArrowUpRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Progress} from '@/components/ui/progress';
import {Badge} from '@/components/ui/badge';
import {api,post} from '@/lib/api';

export default function MaterialAuditProgress({onUpdated}){
 const [job,setJob]=useState(null),[error,setError]=useState(''),[starting,setStarting]=useState(false);
 const lastCount=useRef(-1);
 useEffect(()=>{let cancelled=false,timer;async function poll(){try{const value=await api('/api/material-pages/audits/latest');if(cancelled)return;if(lastCount.current>=0&&lastCount.current!==value?.completed)onUpdated?.();lastCount.current=value?.completed??-1;setJob(value);setError('');}catch(e){if(!cancelled)setError(e.message);}if(!cancelled)timer=setTimeout(poll,4000);}void poll();return()=>{cancelled=true;clearTimeout(timer);};},[]);
 const start=async()=>{setStarting(true);setError('');try{const value=await post(job?.status==='failed'?`/api/material-pages/audits/${job.id}/resume`:'/api/material-pages/audits',{});setJob(value);}catch(e){setError(e.message);}finally{setStarting(false);}};
 return <section className="material-audit-progress"><div className="material-audit-title"><span className="material-audit-icon">{job?.status==='running'?<Loader2 size={20} className="animate-spin"/>:job?.status==='done'?<CheckCircle2 size={20}/>:<Eye size={20}/>}</span><div><h3>逐张图片复核</h3><p>{job?.status==='running'?'Hermes正在读取原始预览，逐页核对并保存标签。':job?.status==='done'?'本轮逐图复核已完成。容量仍需在实际填充后检查。':'读取实际页面，核对用途、逻辑、模块结构与风格。'}</p></div><Badge variant="secondary">{job?`${job.completed} / ${job.total} 页`:'尚未开始'}</Badge><Button variant="outline" size="sm" disabled={starting||job?.status==='running'} onClick={start}><RefreshCw className={starting?'animate-spin':''}/>{job?.status==='failed'?'继续未通过页面':'复核未核对页面'}</Button></div>{job&&<><Progress value={job.total?job.completed/job.total*100:0}/><div className="material-audit-meta"><span>已视觉复核 {job.completed} 页{job.failed>0?` · ${job.failed} 页待重试`:''}</span><span>真实图像输入 · 按批保存 · 不冒充人工确认</span>{job.status==='done'&&<a href={'/api/material-audits/'+job.id+'/report'} target="_blank" rel="noreferrer">查看逐页复核报告<ArrowUpRight size={12}/></a>}<a href="/?v=24&tab=hermes">查看Hermes执行记录<ArrowUpRight size={12}/></a></div></>}{error&&<p className="material-audit-error">{error}</p>}</section>;
}
