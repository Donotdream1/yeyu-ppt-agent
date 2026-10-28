import React,{useEffect,useState,lazy,Suspense} from 'react';
import {api} from '@/lib/api';
import {useAuth} from '@/components/AuthGate';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import SettingsShell from './SettingsShell';
import ModelConnections from './ModelConnections';
import GenerationQuota from './GenerationQuota';
import {Rules} from './Resources';
const HermesWorkspace=lazy(()=>import('./HermesWorkspace'));
const PresentationSettings=lazy(()=>import('./PresentationPreferences'));
const Personalization=lazy(()=>import('./Personalization'));
const HelpCenter=lazy(()=>import('./HelpCenter'));
const UserManagement=lazy(()=>import('./UserManagement'));
export default function SettingsPage({s,onOpen,initialSection='account',onSectionChange=()=>{},onClose=()=>s.setTab('create')}){
 const auth=useAuth(),user=auth?.user,[name,setName]=useState(user?.displayName||''),[currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[network,setNetwork]=useState(null),[section,setSection]=useState(['rules','charts','skills'].includes(s.tab)?'skills':s.tab==='hermes'?'agents':'account');
 useEffect(()=>{api('/api/network').then(setNetwork).catch(()=>{});},[]);
 useEffect(()=>{const next=['rules','charts','skills'].includes(s.tab)?'skills':s.tab==='hermes'?'agents':initialSection;const allowed=next==='users'&&user?.role!=='owner'?'account':next;setSection(allowed);if(allowed!==next)onSectionChange(allowed);},[initialSection,s.tab,user?.role]);
 async function saveAccount(){setBusy(true);setError('');setMessage('');try{const result=await api('/api/auth/profile',{method:'PATCH',body:JSON.stringify({displayName:name,...(newPassword?{currentPassword,newPassword}:{})})});auth.setUser(result.user);setCurrentPassword('');setNewPassword('');setMessage('已保存');}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function saveModel(){setBusy(true);setError('');setMessage('');try{const result=await api('/api/auth/profile',{method:'PATCH',body:JSON.stringify({preferences:{model:s.model}})});auth.setUser(result.user);setMessage('已保存');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <SettingsShell section={section} onSectionChange={v=>{setSection(v);onSectionChange(v);setError('');setMessage('');}} onClose={onClose}><section className="unified-settings"><TabsContent value="personalization"><Suspense fallback={<p>载入中…</p>}><Personalization/></Suspense></TabsContent><TabsContent value="help"><Suspense fallback={<p>载入中…</p>}><HelpCenter onModel={()=>{setSection('model');onSectionChange('model');}} onNavigate={s.setTab}/></Suspense></TabsContent><TabsContent value="account"><div className="settings-form"><GenerationQuota/><label>账号<Input value={user?.username||''} readOnly/></label><label>昵称<Input value={name} onChange={e=>setName(e.target.value)} maxLength={40}/></label><label>当前密码<Input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password"/></label><label>新密码<Input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password" minLength={8}/></label><div className="settings-actions"><Button disabled={busy} onClick={()=>void saveAccount()}>保存</Button></div>{network?.lanUrls?.length>0&&<div className="settings-network">访问地址{network.lanUrls.map(url=><a key={url} href={url+'/workspace'}>{url}</a>)}</div>}</div></TabsContent>{user?.role==='owner'&&<TabsContent value="users"><Suspense fallback={<p>载入用户…</p>}><UserManagement/></Suspense></TabsContent>}<TabsContent value="model"><ModelConnections s={s}/></TabsContent><TabsContent value="presentation"><div className="presentation-settings-inline"><Suspense fallback={<p>载入中…</p>}><PresentationSettings s={s}/></Suspense></div></TabsContent><TabsContent value="skills"><Rules s={{...s,tab:['rules','charts','skills'].includes(s.tab)?s.tab:'skills'}}/></TabsContent><TabsContent value="agents"><Suspense fallback={<p>载入中…</p>}><HermesWorkspace s={s} onOpen={onOpen}/></Suspense></TabsContent>{message&&<p className="settings-message" role="status">{message}</p>}{error&&<p className="auth-error" role="alert">{error}</p>}</section></SettingsShell>;
}
