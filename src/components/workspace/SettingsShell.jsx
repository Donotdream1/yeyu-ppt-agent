import React,{useState} from 'react';
import {UserRound,SlidersHorizontal,Palette,Users,BookOpen,Workflow,HelpCircle,LayoutTemplate,X,LogOut} from 'lucide-react';
import {useAuth} from '@/components/AuthGate';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
const sections=[['account','账号',UserRound],['model','模型',SlidersHorizontal],['presentation','演示',LayoutTemplate],['personalization','个性化',Palette],['users','用户管理',Users],['skills','技能与规则',BookOpen],['agents','运行记录',Workflow],['help','帮助',HelpCircle]];
export default function SettingsShell({section,onSectionChange,onClose,children}){
 const auth=useAuth(),[error,setError]=useState(''),visible=sections.filter(([key])=>key!=='users'||auth.user.role==='owner');
 return <Dialog open onOpenChange={v=>{if(!v)onClose();}}><DialogContent className={'chat-settings-dialog'+(section==='users'?' chat-settings-dialog--users':'')} showCloseButton={false}><DialogHeader className="sr-only"><DialogTitle>设置</DialogTitle><DialogDescription>账号、界面偏好、演示和系统管理</DialogDescription></DialogHeader><Button className="chat-settings-close" variant="ghost" size="icon" aria-label="关闭设置" onClick={onClose}><X size={18}/></Button><Tabs value={section} onValueChange={onSectionChange} orientation="vertical" className="chat-settings-layout"><aside className="chat-settings-nav"><h1>设置</h1><TabsList aria-label="设置分类">{visible.map(([value,label,Icon])=><TabsTrigger key={value} value={value}><Icon size={18}/><span>{label}</span></TabsTrigger>)}</TabsList><Button variant="ghost" className="settings-logout" onClick={async()=>{try{await auth.logout();}catch(e){setError(e.message);}}}><LogOut size={17}/><span>退出登录</span></Button>{error&&<p role="alert" className="auth-error">{error}</p>}</aside><div className="chat-settings-panel"><header><h2>{visible.find(([v])=>v===section)?.[1]||'账号'}</h2></header><div className="chat-settings-body">{children}</div></div></Tabs></DialogContent></Dialog>;
}
