import React,{useState} from 'react';
import {api} from '@/lib/api';
import {useAuth} from '@/components/AuthGate';
import {Button} from '@/components/ui/button';
import {SelectField} from '@/components/ui/select-field';
import {Switch} from '@/components/ui/switch';
export default function Personalization(){
 const auth=useAuth(),[value,setValue]=useState({sidebarCollapsed:true,startPage:'create',fontSize:'standard',reducedMotion:false,...auth.user.preferences?.personalization}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function save(){setBusy(true);setError('');try{const result=await api('/api/auth/profile',{method:'PATCH',body:JSON.stringify({preferences:{personalization:value}})});auth.setUser(result.user);setNotice('个性化偏好已保存');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="settings-form"><label>默认进入页面<SelectField aria-label="默认进入页面" value={value.startPage} onValueChange={startPage=>setValue({...value,startPage})}><option value="create">创作工作台</option><option value="history">最近作品</option><option value="projects">项目</option><option value="styles">版式与Skills</option></SelectField></label><label>界面字号<SelectField aria-label="界面字号" value={value.fontSize} onValueChange={fontSize=>setValue({...value,fontSize})}><option value="standard">标准</option><option value="large">偏大</option></SelectField></label><label className="personalization-toggle"><span>默认收起侧栏</span><Switch aria-label="默认收起侧栏" checked={value.sidebarCollapsed} onCheckedChange={sidebarCollapsed=>setValue({...value,sidebarCollapsed})}/></label><label className="personalization-toggle"><span>减少界面动效</span><Switch aria-label="减少界面动效" checked={value.reducedMotion} onCheckedChange={reducedMotion=>setValue({...value,reducedMotion})}/></label><Button disabled={busy} onClick={()=>void save()}>保存个性化</Button>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}</div>;
}
