import BrandMark from '@/components/BrandMark';
import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {ArrowRight,Loader2,RefreshCw} from 'lucide-react';
import {api,post} from '@/lib/api';
const AuthContext=createContext(null);
export const useAuth=()=>useContext(AuthContext);
const target=user=>{const p=new URLSearchParams(location.search).get('returnTo');return p&&p.startsWith('/')&&!p.startsWith('//')&&!/^\/(login|register)/.test(p)?p:({create:'/workspace',history:'/history',projects:'/projects',styles:'/styles'}[user?.preferences?.personalization?.startPage]||'/workspace');};
export default function AuthGate({children}){
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[setup,setSetup]=useState(false),[mode,setMode]=useState(location.pathname==='/register'?'register':'login'),[form,setForm]=useState({username:'',displayName:'',password:''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [captcha,setCaptcha]=useState(null),[captchaText,setCaptchaText]=useState(''),[captchaLoading,setCaptchaLoading]=useState(false),[captchaError,setCaptchaError]=useState('');
 const captchaRequest=useRef(0);
 useEffect(()=>{api('/api/auth/session').then(value=>{setUser(value.user);setSetup(value.setupRequired);if(!value.user){const current=location.pathname+location.search;if(!['/login','/register'].includes(location.pathname)){const next=value.setupRequired?'register':'login';setMode(next);history.replaceState(null,'',`/${next}?returnTo=${encodeURIComponent(current)}`);}}else if(['/login','/register'].includes(location.pathname))location.replace(target(value.user));}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 useEffect(()=>{const expired=()=>location.assign('/login?returnTo='+encodeURIComponent(location.pathname+location.search));window.addEventListener('yeyu-auth-expired',expired);return()=>window.removeEventListener('yeyu-auth-expired',expired);},[]);
 async function refreshCaptcha(){
  const request=++captchaRequest.current;setCaptchaLoading(true);setCaptchaError('');setCaptchaText('');
  try{const value=await api('/api/auth/captcha'+(captcha?.id?'?previous='+encodeURIComponent(captcha.id):''));if(request===captchaRequest.current)setCaptcha(value);}
  catch(e){if(request===captchaRequest.current){setCaptcha(null);setCaptchaError(e.message||'验证码加载失败，请重试');}}
  finally{if(request===captchaRequest.current)setCaptchaLoading(false);}
 }
 useEffect(()=>{if(mode==='register'&&!loading&&!user)void refreshCaptcha();return()=>{captchaRequest.current++;};},[mode,loading,user]);
 async function submit(e){
  e.preventDefault();if(mode==='register'&&(!captcha||captchaLoading||captchaText.length!==5)){setError('请先填写图形验证码');return;}
  setBusy(true);setError('');
  try{const value=await post('/api/auth/'+mode,{...form,...(mode==='register'?{captchaId:captcha.id,captchaText}: {})});setUser(value.user);location.assign(target(value.user));}
  catch(e){setError(e.message);if(mode==='register')await refreshCaptcha();}
  finally{setBusy(false);}
 }
 async function logout(){await post('/api/auth/logout',{});setUser(null);location.assign('/login');}
 if(loading)return <div className="auth-loading"><Loader2 size={22} className="animate-spin"/></div>;
 if(!user)return <main className="auth-page"><a className="auth-brand" href="/workspace"><BrandMark size={28}/>页语</a><form onSubmit={submit} className="auth-form"><h1>{mode==='register'?'创建账号':'欢迎回来'}</h1>{setup&&mode==='register'&&<p className="auth-setup">首个账号为本机管理员</p>}<label>账号<InputField autoComplete="username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} required minLength={3} maxLength={64} placeholder="英文账号或邮箱"/></label>{mode==='register'&&<label>昵称<InputField autoComplete="nickname" value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} maxLength={40} placeholder="你的名字"/></label>}<label>密码<InputField type="password" autoComplete={mode==='register'?'new-password':'current-password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required minLength={8} maxLength={128} placeholder="至少8位"/></label>{mode==='register'&&<div className="auth-captcha"><label htmlFor="signup-captcha">验证码</label><div className="auth-captcha-row"><InputField id="signup-captcha" aria-describedby="captcha-help" value={captchaText} onChange={e=>setCaptchaText(e.target.value.replace(/[^a-z0-9]/gi,'').toUpperCase())} required minLength={5} maxLength={5} pattern="[A-Za-z0-9]{5}" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="输入5位验证码"/><button type="button" className="auth-captcha-image" aria-label="刷新注册验证码" title="看不清？点击换一张" disabled={busy||captchaLoading} onClick={()=>void refreshCaptcha()}>{captchaLoading?<Loader2 size={20} className="animate-spin"/>:captcha?<><img src={captcha.image} alt="随机图形验证码"/><RefreshCw size={14}/></>:<><RefreshCw size={16}/><span>点击重试</span></>}</button></div><small id="captcha-help">不区分大小写 · 点击图片可更换</small>{captchaError&&<p role="alert" className="auth-error">{captchaError}</p>}</div>}{error&&<p role="alert" className="auth-error">{error}</p>}<button type="submit" className="auth-submit" disabled={busy||mode==='register'&&(!captcha||captchaLoading||captchaText.length!==5)}>{busy?<Loader2 className="animate-spin" size={18}/>:<>{mode==='register'?'注册并继续':'登录'}<ArrowRight size={16}/></>}</button><div className="auth-switch">{mode==='register'?'已有账号？':'还没有账号？'}<button type="button" disabled={busy} onClick={()=>{const next=mode==='register'?'login':'register';setMode(next);setError('');setCaptcha(null);setCaptchaText('');setCaptchaError('');history.replaceState(null,'','/'+next+location.search);}}>{mode==='register'?'登录':'注册'}</button></div></form></main>;
 return <AuthContext.Provider value={{user,setUser,logout}}>{children}</AuthContext.Provider>;
}
function InputField(props){return <input className="auth-input" {...props}/>;}
