import React,{useEffect,useState} from 'react';
import DirectoryPicker from './DirectoryPicker';
import {FolderOpen} from 'lucide-react';
import {api,post} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
export default function ProjectCreateDialog({open,onOpenChange,onCreated,title='新建项目',nameLabel='项目名称'}){
 const [name,setName]=useState(''),[location,setLocation]=useState(null),[parent,setParent]=useState(''),[choosing,setChoosing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(open){setName('');setParent('');setError('');api('/api/projects/location').then(v=>{setLocation(v);}).catch(e=>setError(e.message));}},[open]);
 async function create(e){e.preventDefault();setBusy(true);setError('');try{const project=await post('/api/workspace/folders',{name,parentPath:parent});window.dispatchEvent(new Event('yeyu-library-change'));onOpenChange(false);onCreated(project);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="project-create-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>先选择项目名称和保存位置。</DialogDescription></DialogHeader><form onSubmit={create}><label>{nameLabel}<Input autoFocus aria-label={nameLabel} value={name} onChange={e=>setName(e.target.value)} maxLength={60} placeholder="例如：2026年度工作汇报"/></label><label>保存位置<div className="project-location-field"><Input aria-label="项目保存目录" value={parent} readOnly placeholder="请选择保存位置"/><Button type="button" variant="outline" onClick={()=>setChoosing(true)}><FolderOpen size={16}/>选择文件夹</Button></div></label>{error&&<p role="alert">{error}</p>}<Button disabled={busy||!name.trim()||!location||!parent} type="submit">{busy?'创建中…':'创建项目'}</Button></form><DirectoryPicker open={choosing} onOpenChange={setChoosing} onSelect={setParent}/></DialogContent></Dialog>;
}
