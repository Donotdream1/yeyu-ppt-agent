import React,{useEffect,useState,useRef} from 'react';
import {Search,ArrowUpRight,Download,RefreshCw,Clock3,FolderPlus,FolderOpen,Trash2,Undo2,Pencil,Plus} from 'lucide-react';
import {SelectField} from '@/components/ui/select-field';
import {useAuth} from '@/components/AuthGate';
import {accountStorage} from '@/lib/account-storage';
import {api,post} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Skeleton} from '@/components/ui/skeleton';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import ProjectCreateDialog from './ProjectCreateDialog';
import SlideImage from './SlideImage';
export const notifyLibraryChange=()=>window.dispatchEvent(new Event('yeyu-library-change'));
export default function History({onOpen,onNew,disabled,compact=false}){
 const store=accountStorage(useAuth()?.user,'session'),saved=useRef(null);if(saved.current===null){try{saved.current=JSON.parse(store.getItem(compact?'history-compact-view':'history-view')||'{}');}catch{saved.current={};}}
 const [query,setQuery]=useState(saved.current.query||''),[page,setPage]=useState(saved.current.page||1),[data,setData]=useState({items:[],total:0,pages:1}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),[folders,setFolders]=useState([]),[active,setActive]=useState(saved.current.active||'all'),[dialog,setDialog]=useState(null),[name,setName]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[selected,setSelected]=useState([]),[creating,setCreating]=useState(false),[purgeTarget,setPurgeTarget]=useState(null);
 useEffect(()=>setSelected([]),[query,page,active]);
 useEffect(()=>{store.setItem(compact?'history-compact-view':'history-view',JSON.stringify({query,page,active,scrollY:saved.current.scrollY||0}));},[query,page,active]);
 useEffect(()=>{if(!loading&&saved.current.scrollY){window.scrollTo({top:saved.current.scrollY,behavior:'instant'});saved.current.scrollY=0;}},[loading]);
 function open(id){store.setItem(compact?'history-compact-view':'history-view',JSON.stringify({query,page,active,scrollY:window.scrollY}));onOpen(id);}
 const currentFolder=folders.find(f=>f.id===active),trash=active==='trash';
 useEffect(()=>{let live=true;api('/api/workspace/folders').then(v=>{if(live)setFolders(v.items);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[revision]);
 useEffect(()=>{const change=()=>setRevision(n=>n+1);window.addEventListener('yeyu-library-change',change);return()=>window.removeEventListener('yeyu-library-change',change);},[]);
 useEffect(()=>{let cancelled=false;setLoading(true);const timer=setTimeout(()=>api('/api/outputs?'+new URLSearchParams({page,limit:compact?8:12,q:query,folderId:trash?'all':active,trash:String(trash)})).then(v=>{if(!cancelled){setData(v);setError('');if(page>v.pages)setPage(v.pages);}}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);}),180);return()=>{cancelled=true;clearTimeout(timer);};},[query,page,revision,active,compact]);
 async function mutate(action,message){setBusy(true);setError('');try{await action();setNotice(message);notifyLibraryChange();return true;}catch(e){setError(e.message);return false;}finally{setBusy(false);}}
 async function saveFolder(e){e.preventDefault();if(await mutate(()=>dialog.mode==='new'?post('/api/workspace/folders',{name}):api('/api/workspace/folders/'+dialog.id,{method:'PATCH',body:JSON.stringify({name})}),'文件夹已保存'))setDialog(null);}
 return <div className={'work-library'+(compact?' compact':'')}>
  {!compact&&<div className="folder-navigation" aria-label="作品文件夹">
   {[['all','全部作品'],['unfiled','未分类'],...folders.map(f=>[f.id,f.name]),['trash','回收站']].map(([id,label])=><Button key={id} variant={active===id?'secondary':'ghost'} size="sm" aria-pressed={active===id} onClick={()=>{setActive(id);setPage(1);setNotice('');}}>{id==='trash'?<Trash2 size={15}/>:<FolderOpen size={15}/>}<span>{label}</span></Button>)}
   <Button variant="outline" size="sm" onClick={()=>{setCreating(true);}}><FolderPlus size={15}/>新建文件夹</Button>
  </div>}
  <div className="resource-toolbar">
   <div className="search-field"><Search size={17}/><Input aria-label="搜索历史作品" placeholder="搜索作品名称" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></div>
   <span>{data.total} 份作品</span>
   <Button variant="outline" aria-label="刷新作品" onClick={()=>setRevision(n=>n+1)}><RefreshCw className={loading?'animate-spin':''}/>刷新</Button>
   {!compact&&!trash&&onNew&&<Button disabled={disabled||busy} onClick={()=>onNew(currentFolder?.id||null,currentFolder?.name||'')}><Plus/>新建PPT</Button>}
   {currentFolder&&!compact&&<><Button variant="ghost" size="icon" aria-label="重命名文件夹" onClick={()=>{setName(currentFolder.name);setDialog({mode:'rename',id:currentFolder.id});}}><Pencil size={16}/></Button><Button variant="ghost" size="icon" aria-label="删除空文件夹" disabled={busy} onClick={()=>void mutate(async()=>{await api('/api/workspace/folders/'+currentFolder.id,{method:'DELETE'});setActive('all');},'文件夹已删除')}><Trash2 size={16}/></Button></>}
  </div>
  {!compact&&<div className="selection-actionbar"><label><input type="checkbox" aria-label="全选本页作品" checked={data.items.length>0&&data.items.every(i=>selected.includes(i.id))} onChange={e=>setSelected(e.target.checked?data.items.map(i=>i.id):[])}/>全选本页</label><span>已选 {selected.length} 份</span>{!trash&&<Button variant="outline" disabled={!selected.length||busy} onClick={()=>void mutate(async()=>{await post('/api/outputs/batch-delete',{ids:selected});setSelected([]);},'所选作品已移至回收站')}><Trash2 size={15}/>删除所选</Button>}{trash&&<><Button variant="outline" disabled={busy||(!selected.length&&!data.total)} onClick={()=>setPurgeTarget(selected.length?{ids:[...selected]}:{all:true})}><Trash2 size={15}/>{selected.length?`永久删除所选（${selected.length}）`:'清空回收站'}</Button><span>永久删除后无法恢复</span></>}</div>}
  {error&&<div className="notice warning" role="alert">{error}</div>}{notice&&<div className="library-notice" role="status">{notice}<button aria-label="关闭操作结果" onClick={()=>setNotice('')}>×</button></div>}
  <div className="history-grid">{loading?Array.from({length:compact?2:6},(_,i)=><Skeleton className="history-skeleton" key={i}/>):data.items.map(item=><Card className="history-card" key={item.id}><button className="history-card-open" type="button" aria-label={'打开作品'+item.title} disabled={disabled||busy} onClick={()=>open(item.id)}/>{!compact&&<label className="item-select-checkbox"><input type="checkbox" aria-label={'选择作品'+item.title} checked={selected.includes(item.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,item.id]:old.filter(id=>id!==item.id))}/></label>}
   <div className="history-cover"><SlideImage src={item.thumbnail} alt={item.title+'封面'}/></div>
   <CardContent><div className="history-card-heading"><h3>{item.title}</h3><Badge variant="secondary">{item.pages} 页</Badge></div><p><Clock3 size={13}/>{item.createdAt&&!Number.isNaN(Date.parse(item.createdAt))?new Date(item.createdAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}):'时间待补充'}</p>
    <div className="history-card-actions">{!compact&&!trash&&<SelectField className="history-folder-select" aria-label={item.title+'所在文件夹'} value={item.folderId||''} disabled={busy} onChange={e=>void mutate(()=>api('/api/outputs/'+item.id+'/organization',{method:'PATCH',body:JSON.stringify({folderId:e.target.value||null})}),'作品已移动')}><option value="">未分类</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</SelectField>}<Button variant="ghost" size="sm" asChild><a href={item.url}><Download/>下载</a></Button>
     {!compact&&(trash?<Button variant="ghost" size="sm" disabled={busy} aria-label={'恢复'+item.title} onClick={()=>void mutate(()=>post('/api/outputs/'+item.id+'/restore',{}),'作品已恢复')}><Undo2 size={15}/>恢复</Button>:<Button variant="ghost" size="icon" disabled={busy} aria-label={'删除'+item.title} onClick={()=>void mutate(()=>api('/api/outputs/'+item.id,{method:'DELETE'}),'已移至回收站')}><Trash2 size={15}/></Button>)}
     {!compact&&trash&&<Button variant="ghost" size="sm" disabled={busy} aria-label={'永久删除'+item.title} onClick={()=>setPurgeTarget({ids:[item.id]})}><Trash2 size={15}/>永久删除</Button>}
    </div>
    
   </CardContent>
  </Card>)}</div>
  {!loading&&!data.items.length&&!error&&<div className="empty-state"><FolderOpen size={32}/><h2>{trash?'回收站为空':'还没有匹配的作品'}</h2>{currentFolder&&onNew&&<Button onClick={()=>onNew(currentFolder.id,currentFolder.name)}><Plus/>在此文件夹新建PPT</Button>}</div>}
  <div className="resource-pagination"><Button variant="outline" disabled={page<=1||loading} onClick={()=>setPage(n=>n-1)}>上一页</Button><span>{page} / {data.pages}</span><Button variant="outline" disabled={page>=data.pages||loading} onClick={()=>setPage(n=>n+1)}>下一页</Button></div>
  <Dialog open={!!purgeTarget} onOpenChange={v=>{if(!v&&!busy)setPurgeTarget(null);}}><DialogContent><DialogHeader><DialogTitle>{purgeTarget?.all?'清空回收站':'永久删除所选作品'}</DialogTitle><DialogDescription>{purgeTarget?.all?'将永久删除回收站中的全部作品及其输出文件，包括其他页和搜索结果之外的作品，无法恢复。':`将永久删除所选 ${purgeTarget?.ids?.length||0} 份作品及其输出文件，无法恢复。`}</DialogDescription></DialogHeader>{error&&<p role="alert">{error}</p>}<div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={()=>setPurgeTarget(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={async()=>{if(await mutate(()=>post('/api/outputs/purge',purgeTarget),purgeTarget.all?'回收站已清空':'所选作品已永久删除')){setSelected([]);setPurgeTarget(null);}}}>{busy?'删除中…':'确认永久删除'}</Button></div></DialogContent></Dialog>
  <ProjectCreateDialog open={creating} onOpenChange={setCreating} title="新建文件夹" nameLabel="文件夹名称" onCreated={()=>{notifyLibraryChange();setNotice('文件夹已创建');}}/>
  <Dialog open={!!dialog} onOpenChange={v=>{if(!v)setDialog(null);}}><DialogContent className="folder-dialog"><DialogHeader><DialogTitle>{dialog?.mode==='new'?'新建文件夹':'重命名文件夹'}</DialogTitle><DialogDescription className="sr-only">管理当前账号的演示作品文件夹。</DialogDescription></DialogHeader><form onSubmit={saveFolder}><Input autoFocus aria-label="文件夹名称" value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder="文件夹名称"/>{error&&<p role="alert">{error}</p>}<Button type="submit" disabled={busy||!name.trim()}>保存文件夹</Button></form></DialogContent></Dialog>
 </div>;
}

