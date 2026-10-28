import {SelectField} from '@/components/ui/select-field';
import React,{useEffect,useRef,useState} from 'react';
import {ArrowUp,Plus,X,Loader2,MessageSquare,PanelsTopLeft,ChevronDown,Undo2,MousePointer2} from 'lucide-react';
import {api,post} from '@/lib/api';

export default function PageAgentPanel({s,children,onInspection,selectedIds=[],onClearSelection}){
 const [mode,setMode]=useState('chat'),[session,setSession]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[sending,setSending]=useState(false),[drafts,setDrafts]=useState({}),[jobs,setJobs]=useState([]),[refresh,setRefresh]=useState(0);
 const fileInput=useRef(),messagesEnd=useRef(),revision=useRef(0),page=s.page,outputId=s.output?.id;
 useEffect(()=>()=>s.setRecommendActive?.(false),[]);
 useEffect(()=>s.setRecommendActive?.(mode==='design'),[mode]);
 const current=session?.page===page&&(!session.currentOutputId||session.currentOutputId===outputId)?session:null,key=(session?.rootId||outputId)+':'+page,draft=drafts[key]||{text:'',photos:[],placements:{}};
 const updateDraft=patch=>setDrafts(old=>({...old,[key]:{...(old[key]||{text:'',photos:[],placements:{}}),...patch}}));
 const active=jobs.find(j=>j.page===page&&['queued','running'].includes(j.status))||(['queued','running'].includes(current?.job?.status)?current.job:null);
 useEffect(()=>{if(!outputId)return;const controller=new AbortController();setLoading(true);setError('');api(`/api/page-sessions?outputId=${outputId}&page=${page}`,{signal:controller.signal}).then(value=>{setSession(value);revision.current=value.revision;}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[outputId,page,refresh]);
 useEffect(()=>{
  if(!session?.rootId)return;let cancelled=false,timer,busy=false;const root=session.rootId;
  const poll=async()=>{if(busy)return;busy=true;try{const state=await api('/api/page-workspaces/'+root);if(cancelled)return;setJobs(state.jobs||[]);s.setPageWorkBusy?.((state.jobs||[]).some(j=>['queued','running'].includes(j.status)));
   if(state.headOutputId!==outputId&&state.revision>=revision.current){const out=await api('/api/outputs/'+state.headOutputId);if(cancelled)return;revision.current=state.revision;s.setPlan(out.plan);s.setOutput(out);}
   const latest=await api(`/api/page-sessions?outputId=${state.headOutputId}&page=${page}`);if(!cancelled)setSession(latest);
  }catch(e){if(!cancelled)setError(e.message);}finally{busy=false;if(!cancelled)timer=setTimeout(poll,2500);}};
  timer=setTimeout(poll,1500);return()=>{cancelled=true;clearTimeout(timer);};
 },[session?.rootId,outputId,page]);
 useEffect(()=>{const parent=messagesEnd.current?.parentElement;if(parent)parent.scrollTop=parent.scrollHeight;},[current?.messages?.length]);
 async function upload(files){if(!current||!files.length)return;setSending(true);setError('');try{const form=new FormData();for(const file of [...files].slice(0,6))form.append('photos',file);const result=await api(`/api/page-sessions/${current.id}/photos`,{method:'POST',body:form});updateDraft({photos:[...draft.photos,...result.photos].slice(-6)});setRefresh(n=>n+1);}catch(e){setError(e.message);}finally{setSending(false);if(fileInput.current)fileInput.current.value='';}}
 async function send(){if(!current||sending||active||(!draft.text.trim()&&!draft.photos.length))return;setSending(true);setError('');try{const placements=draft.photos.flatMap(p=>{const target=draft.placements[p.id];if(!target||target==='describe')return [];const preset={right:{x:.63,y:.29,w:.31,h:.49},left:{x:.06,y:.29,w:.31,h:.49},bottomRight:{x:.69,y:.59,w:.24,h:.3}}[target];return [{assetId:p.id,...(preset?{box:preset}:{targetShapeId:Number(target)}),fit:'contain'}];});const result=await post(`/api/page-sessions/${current.id}/messages`,{message:draft.text.trim()||'将我上传的照片放入各自指定的位置，保持照片比例。',assetIds:draft.photos.map(p=>p.id),placements,selection:selectedIds.length?{shapeIds:selectedIds,fingerprint:current.inspection.fingerprint}:undefined,apiKey:s.apiKey,model:s.model});setJobs(old=>[...old.filter(j=>j.id!==result.job.id),result.job]);updateDraft({text:'',photos:[],placements:{}});setRefresh(n=>n+1);}catch(e){setError(e.message);}finally{setSending(false);}}
 useEffect(()=>{onInspection?.(current?.inspection||null);},[current?.inspection,onInspection]);
 useEffect(()=>{if(selectedIds.length)setMode('chat');},[selectedIds.join(',')]);
 const photoTargets=current?.inspection.shapes.filter(p=>p.photoCandidate)||[];
 return <div className="page-agent-panel">
  <div className="page-agent-tabs"><button type="button" className={mode==='chat'?'active':''} onClick={()=>{setMode('chat');s.setRecommendActive?.(false);}}><MessageSquare size={15}/>本页对话</button><button type="button" className={mode==='design'?'active':''} onClick={()=>{setMode('design');s.setRecommendActive?.(true);}}><PanelsTopLeft size={15}/>推荐设计 <span>{s.recommendations.items.length}</span></button></div>
  <div hidden={mode!=='chat'} className="page-chat" aria-label={`第${page+1}页智能体对话`}>
   <div className="page-chat-heading"><strong>第 {page+1} 页 </strong><span>Hermes · {s.model}</span><button type="button" aria-label="撤回本页上次修改" title="只撤回当前页，不影响其他页" disabled={!!active||sending||!current?.messages.some(m=>m.outputId&&!m.undo&&!(current?.undoneOutputs||[]).includes(m.outputId))} onClick={async()=>{setSending(true);setError('');try{const result=await post(`/api/page-sessions/${current.id}/undo`,{});setJobs(old=>[...old,result.job]);setRefresh(n=>n+1);}catch(e){setError(e.message);}finally{setSending(false);}}}><Undo2 size={14}/></button></div>
   <div className="page-chat-messages" aria-live="polite">
    {loading&&!current?<p className="chat-empty"><Loader2 size={17} className="animate-spin"/>正在读取本页</p>:!current?.messages.length?<div className="chat-empty"><MessageSquare size={21}/><strong>这一页，想怎么改？</strong><p>修改文字、移动模块、调整图案，或上传照片。</p><button type="button" onClick={()=>updateDraft({text:'帮我检查本页的标题、正文和模块是否对应，推荐合适的设计。'})}>检查本页并推荐模块</button></div>:current.messages.map(m=><div key={m.id} className={'page-chat-message '+m.role}><span>{m.content}</span>{m.assetIds?.length>0&&<div className="message-photos">{m.assetIds.map(id=><img key={id} src={'/api/page-assets/'+id} alt="本页上传照片"/>)}</div>}{m.outputId&&<small>已生成新版本</small>}</div>)}
    {active&&<div className="page-chat-working" role="status"><Loader2 size={14} className="animate-spin"/>{active.phase}</div>}<div ref={messagesEnd}/>
   </div>
   {error&&<p className="page-chat-error" role="alert">{error}</p>}
   <div className="chat-composer" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void upload(e.dataTransfer.files);}}>
    {draft.photos.length>0&&<div className="composer-photos">{draft.photos.map(p=><div key={p.id}><img src={p.url} alt={p.name}/><button type="button" aria-label={'移除照片'+p.name} onClick={()=>updateDraft({photos:draft.photos.filter(x=>x.id!==p.id)})}><X size={12}/></button><SelectField aria-label={p.name+'放置位置'} value={draft.placements[p.id]||'describe'} onChange={e=>{const value=e.target.value;updateDraft({placements:{...draft.placements,[p.id]:value}});const box=({right:{x:.63,y:.29,w:.31,h:.49},left:{x:.06,y:.29,w:.31,h:.49},bottomRight:{x:.69,y:.59,w:.24,h:.3}})[value]||photoTargets.find(t=>String(t.id)===value)?.box;s.setPhotoTargetPreview?.(box?{page,box}:null);}}><option value="describe">在消息中描述位置</option>{photoTargets.map((t,i)=><option key={t.id} value={t.id}>图片框 {i+1} · {t.box.x<.4?'左侧':t.box.x>.6?'右侧':'中部'}</option>)}<option value="right">页面右侧</option><option value="left">页面左侧</option><option value="bottomRight">右下角</option></SelectField></div>)}</div>}
    {!!selectedIds.length&&<div className="composer-selection"><MousePointer2 size={14}/><span>{selectedIds.length} 个所选对象</span><button type="button" aria-label="取消对象限定" onClick={onClearSelection}><X size={13}/></button></div>}
    <textarea aria-label="本页修改要求" title="Enter发送，Shift + Enter换行" placeholder="向页语描述这一页怎么改…" value={draft.text} maxLength={8000} onChange={e=>updateDraft({text:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>
    <div className="chat-composer-actions"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>void upload(e.target.files)}/><button type="button" aria-label="添加照片" title="添加照片，也可拖入输入框" disabled={!current||sending} onClick={()=>fileInput.current?.click()}><Plus size={21}/></button><span>{draft.photos.length?`${draft.photos.length} 张照片`:'仅修改当前页'}</span><button type="button" aria-label="发送本页修改要求" className="composer-send" disabled={!current||sending||!!active||(!draft.text.trim()&&!draft.photos.length)} onClick={()=>void send()}>{sending?<Loader2 size={17} className="animate-spin"/>:<ArrowUp size={19}/>}</button></div>
   </div>
  </div>
  <div hidden={mode!=='design'}>{children}</div>
 </div>;
}
