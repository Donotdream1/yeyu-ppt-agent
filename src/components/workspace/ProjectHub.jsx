import React,{useEffect,useRef,useState} from 'react';
import {FolderPlus,FolderOpen,FileText,Upload,ArrowRight,Copy,Files,Plus} from 'lucide-react';
import {copyText} from '@/lib/clipboard';
import {api,post} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import History from './History';
import ProjectCreateDialog from './ProjectCreateDialog';
export default function ProjectHub({s,onStart,onOpen,initialProject,onSelectProject=()=>{},gate=false}){
 const [items,setItems]=useState([]),[selected,setSelected]=useState(initialProject||''),[project,setProject]=useState(null),[creating,setCreating]=useState(false),[error,setError]=useState(''),[tab,setTab]=useState('files'),[revision,setRevision]=useState(0),input=useRef();
 useEffect(()=>{let live=true;api('/api/workspace/folders').then(v=>{if(live)setItems(v.items);}).catch(e=>setError(e.message));return()=>{live=false;};},[revision]);
 useEffect(()=>{if(initialProject)setSelected(initialProject);},[initialProject]);
 useEffect(()=>{if(!selected){setProject(null);return;}let live=true;api('/api/projects/'+selected).then(v=>{if(live){setProject(v);setError('');}}).catch(e=>setError(e.message));return()=>{live=false;};},[selected,revision]);
 async function upload(files){const f=new FormData();for(const file of files)f.append('files',file);try{await api('/api/projects/'+selected+'/files',{method:'POST',body:f});setRevision(n=>n+1);}catch(e){setError(e.message);}}
 const created=p=>{setRevision(n=>n+1);setSelected(p.id);onSelectProject(p.id);if(gate)onStart(p.id,p.name);};
 return <section className={'project-hub'+(gate?' project-gate':'')}>
  <ProjectCreateDialog open={creating} onOpenChange={setCreating} onCreated={created}/>
  <div className="section-toolbar"><div><h2>{gate?'先从一个项目开始':'项目'}</h2><p>{gate?'新建项目，或继续已有项目。':'文件、演示稿与逐页对话集中在这里。'}</p></div><Button onClick={()=>setCreating(true)}><FolderPlus size={16}/>新建项目</Button></div>
  {error&&<div className="notice warning" role="alert">{error}</div>}
  <div className="project-hub-grid"><nav className="project-list" aria-label="项目列表">{items.map(p=><button key={p.id} className={selected===p.id?'active':''} onClick={()=>gate?onStart(p.id,p.name):(setSelected(p.id),onSelectProject(p.id))}><FolderOpen size={18}/><span><strong>{p.name}</strong><small>{p.createdAt?.slice(0,10)}</small></span><ArrowRight size={14}/></button>)}{!items.length&&<div className="project-empty"><FolderOpen size={32}/><p>还没有项目</p></div>}</nav>
   {!gate&&project&&<div className="project-detail"><div className="project-detail-heading"><div><h3>{project.name}</h3><button className="project-disk-path" title={project.diskPath} onClick={async()=>{try{await copyText(project.diskPath);s.setToast?.('目录已复制');}catch(e){setError(e.message);}}}><FolderOpen size={13}/>{project.diskPath}<Copy size={13}/></button></div><Button onClick={()=>onStart(project.id,project.name)}><Plus size={15}/>新建PPT</Button></div>
    <div className="project-tabs"><button className={tab==='files'?'active':''} onClick={()=>setTab('files')}><Files size={15}/>文件</button><button className={tab==='outputs'?'active':''} onClick={()=>setTab('outputs')}><FileText size={15}/>演示稿</button></div>
    {tab==='files'?<><div className="project-files-actions"><Button variant="outline" size="sm" onClick={()=>input.current.click()}><Upload size={14}/>添加文件</Button><input ref={input} type="file" multiple hidden onChange={e=>void upload([...e.target.files])}/></div><div className="project-file-list">{project.manifest.files.map(f=><a key={f.id} href={'/api/projects/'+project.id+'/files/'+f.id}><FileText size={20}/><span><strong>{f.name}</strong><small>{(f.size/1024).toFixed(1)} KB · {f.role==='skill'?'风格Skill':'项目资料'}</small></span></a>)}{!project.manifest.files.length&&<div className="project-empty"><Files size={32}/><p>添加文档、数据或参考素材</p></div>}</div></>:<div className="project-output-list">{project.manifest.versions.slice().reverse().map(v=><button key={v.outputId} onClick={()=>onOpen(v.outputId)}><FileText size={18}/><span>{v.title||'演示稿'}<small>{v.createdAt?.replace('T',' ').slice(0,16)}</small></span><ArrowRight size={14}/></button>)}{!project.manifest.versions.length&&<div className="project-empty"><p>此项目还没有成稿</p></div>}</div>}
   </div>}
   {!gate&&!project&&<div className="project-empty"><FolderOpen size={40}/><p>选择项目，查看文件与演示稿</p></div>}
  </div>
 </section>;
}
