import React,{useEffect,useState} from 'react';
import {FolderOpen,Plus,ArrowUpRight} from 'lucide-react';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import SlideImage from './SlideImage';
export default function HomeResources({s,onProject,onOpen,onNewProject}){
 const [styles,setStyles]=useState([]),[projects,setProjects]=useState([]),[outputs,setOutputs]=useState([]);
 useEffect(()=>{let live=true;Promise.all([api('/api/style-skills'),api('/api/workspace/folders'),api('/api/outputs?limit=4')]).then(([a,b,c])=>{if(live){setStyles(a.items.filter(s=>s.status==='ready').slice(0,4));setProjects(b.items.slice(-4).reverse());setOutputs(c.items);}}).catch(()=>{});return()=>{live=false;};},[s.workspaceFolderId,s.styleSkillId]);
 return <div className="home-resource-sections"><section><header><h2>常用版式</h2><button onClick={()=>s.setTab('styles')}>查看全部<ArrowUpRight size={13}/></button></header><div className="home-style-shortcuts">{styles.map(style=><button className={s.styleSkillId===style.id?'active':''} key={style.id} onClick={()=>s.setStyleSkillId(style.id)}><div className="style-wireframe"><span/><div><i/><i/><i/></div><small/></div><strong>{style.name}</strong><small>{style.family}</small></button>)}</div></section>
 <section><header><h2>项目</h2><Button variant="ghost" size="sm" onClick={()=>onNewProject()}><Plus size={14}/>新建项目</Button></header><div className="home-project-shortcuts">{projects.map(project=><button key={project.id} onClick={()=>onProject(project.id)}><FolderOpen size={22}/><span><strong>{project.name}</strong><small>{project.createdAt?.slice(0,10)}</small></span><ArrowUpRight size={14}/></button>)}{!projects.length&&<button className="home-new-project-card" onClick={()=>onNewProject()}><Plus size={22}/><span>创建第一个项目</span></button>}</div></section>
 {!!outputs.length&&<section><header><h2>最近演示</h2><button onClick={()=>s.setTab('history')}>全部作品<ArrowUpRight size={13}/></button></header><div className="home-output-shortcuts">{outputs.map(output=><button key={output.id} onClick={()=>onOpen(output.id)}><SlideImage src={output.thumbnail} alt={output.title}/><strong>{output.title}</strong><small>{output.pages} 页</small></button>)}</div></section>}
 </div>;
}
