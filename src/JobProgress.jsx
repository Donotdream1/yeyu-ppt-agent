import React from 'react';
import {AlertCircle,CheckCircle2,Loader2,RefreshCw} from 'lucide-react';
import './job-progress.css';

const stages={planning:'理解文档与规划页面',materials:'选择并分析素材',matching:'选择并分析素材','visual-selection':'分析候选素材并选择版式',writing:'并行撰写与填充',filling:'并行撰写与填充',review:'检查页面与修复',export:'PowerPoint 检查与导出',rendering:'PowerPoint 检查与导出',publishing:'保存成稿',done:'制作完成'};
const pageNumber=value=>Number(typeof value==='object'?value?.page:value);
const pageList=value=>Array.isArray(value)?[...new Set(value.map(pageNumber).filter(v=>Number.isInteger(v)&&v>0))]:[];
const count=value=>Array.isArray(value)?pageList(value).length:Math.max(0,Number(value)||0);

export default function JobProgress({job,onResume,resuming=false}){
  if(!job||job.status==='done')return null;
  const progress=job.progress||{},total=Math.max(0,Number(progress.totalPages)||0),completed=Math.min(total||Infinity,count(progress.completedPages)),active=pageList(progress.activePages),failed=pageList(progress.failedPages),complete=pageList(progress.completedPages),workers=Array.isArray(progress.workers)?progress.workers:[],isFailed=job.status==='failed',resumable=Boolean(job.resumable||progress.resumable),hasPageStates=Array.isArray(progress.completedPages),ratio=total?Math.min(100,completed/total*100):0,failedDetails=Array.isArray(progress.failedPages)?progress.failedPages.filter(item=>typeof item==='object'&&(item.error||item.message)):[];
  return <section className={`panel job-progress ${isFailed?'failed':''}`} aria-label="PPT 制作进度">
    <div className="job-progress-heading"><div>{isFailed?<AlertCircle size={20}/>:<Loader2 size={20} className="spinning"/>}<div><strong>{isFailed?'本轮未完成，查看制作进度':stages[progress.stage]||'Hermes 正在制作'}</strong><p role="status" aria-live="polite">{job.phase||stages[progress.stage]||'正在准备任务'}</p></div></div>{total>0&&<span className="job-page-count"><b>{completed}</b> / {total} 页已填充</span>}</div>
    {total>0&&<><progress aria-label="已填充页面" max={total} value={completed}/><div className="job-progress-meta"><span>已填充 {Math.round(ratio)}% · 成稿将在检查与导出后交付</span>{progress.concurrency>0&&<span>最多 {progress.concurrency} 个撰写任务并行</span>}</div></>}
    {hasPageStates&&total>0&&total<=150&&<div className="job-page-grid" aria-label="逐页制作状态">{Array.from({length:total},(_,i)=>{const page=i+1,state=complete.includes(page)?'complete':failed.includes(page)?'failed':active.includes(page)?'active':'waiting';return <span key={page} className={state} title={`第 ${page} 页 · ${{complete:'已填充',failed:'需重试',active:'制作中',waiting:'等待制作'}[state]}`} aria-label={`第 ${page} 页，${{complete:'已填充',failed:'需重试',active:'制作中',waiting:'等待制作'}[state]}`}>{page}</span>;})}</div>}
    {!hasPageStates&&active.length>0&&<p className="job-page-note">正在制作：第 {active.join('、')} 页</p>}
    {workers.length>0&&<div className="job-workers">{workers.map((worker,i)=>{const status=worker.status||'waiting',pages=pageList(worker.pages||[worker.page]);return <div key={worker.id||i} className={`job-worker ${status}`}><span className="job-worker-status">{status==='running'?<Loader2 size={14} className="spinning"/>:status==='done'?<CheckCircle2 size={14}/>:status==='failed'?<AlertCircle size={14}/>:<span className="job-worker-dot"/>}</span><div><strong>{worker.label||`撰写任务 ${i+1}`}</strong><span>{pages.length?`第 ${pages.join('、')} 页 · `:''}{{running:'制作中',done:'已完成',failed:'需重试',waiting:'等待分配',idle:'等待分配'}[status]||status}</span>{worker.error&&<small>{worker.error}</small>}</div></div>;})}</div>}
    {failed.length>0&&<p className="job-page-note">需要重试：第 {failed.join('、')} 页。已完成的页面会保留。</p>}
    {failedDetails.length>0&&<details className="job-failure-details"><summary>查看页面未通过的原因</summary><ul>{failedDetails.map((item,i)=><li key={i}>第 {item.page} 页：{item.error||item.message}</li>)}</ul></details>}
    {isFailed&&resumable&&<div className="job-resume"><p>已保存本次进度，继续时仅处理未完成或未通过检查的页面。</p><button className="button primary" onClick={onResume} disabled={resuming}>{resuming?<Loader2 size={15} className="spinning"/>:<RefreshCw size={15}/>}继续完成剩余页面</button></div>}
  </section>;
}
