import {randomBytes,randomInt,randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import sharp from 'sharp';

const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ',cookie='yeyu_signup';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
async function renderCaptcha(answer){
 const lines=Array.from({length:6},()=>`<path d="M${randomInt(176)} ${randomInt(52)}L${randomInt(176)} ${randomInt(52)}" stroke="#ccd0d3" stroke-width="1"/>`).join('');
 const dots=Array.from({length:24},()=>`<circle cx="${randomInt(176)}" cy="${randomInt(52)}" r="${randomInt(1,3)}" fill="#d6dade"/>`).join('');
 const letters=[...answer].map((c,i)=>{const x=18+i*29,y=36+randomInt(-2,3);return `<text x="${x}" y="${y}" transform="rotate(${randomInt(-12,13)} ${x} ${y})" font-family="Arial,sans-serif" font-size="27" font-weight="700" fill="#30343a">${c}</text>`;}).join('');
 return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="176" height="52"><rect width="176" height="52" rx="10" fill="#f4f5f6"/>${lines}${dots}${letters}</svg>`)).png().toBuffer();
}
export function createRegistrationCaptcha({now=Date.now,randomIndex=randomInt,render=renderCaptcha,ttlMs=300000,maxEntries=3000,issueLimit=60,windowMs=60000}={}){
 const secret=randomBytes(32),challenges=new Map(),limits=new Map(),digest=value=>createHmac('sha256',secret).update(value).digest();
 function sweep(){for(const [id,c]of challenges)if(c.expiresAt<=now())challenges.delete(id);for(const [key,c]of limits)if(c.until<=now())limits.delete(key);}
 async function issue(owner,{previousId,ip='local'}={}){
  sweep();const counter=limits.get(ip)||{count:0,until:now()+windowMs};if(counter.count>=issueLimit)throw fail('验证码刷新过于频繁，请稍后重试',429);counter.count++;limits.set(ip,counter);if(limits.size>5000)limits.delete(limits.keys().next().value);
  if(challenges.get(previousId)?.owner===owner)challenges.delete(previousId);
  const answer=Array.from({length:5},()=>alphabet[randomIndex(alphabet.length)]).join(''),id=randomUUID(),expiresAt=now()+ttlMs;
  const image=await render(answer);sweep();while(challenges.size>=maxEntries)challenges.delete(challenges.keys().next().value);challenges.set(id,{owner,hash:digest(answer),expiresAt});
  return {id,image:'data:image/png;base64,'+image.toString('base64'),expiresAt,length:5};
 }
 function verify(owner,id,text){
  const c=typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)?challenges.get(id):null;if(!c||!owner||c.owner!==owner)throw fail('验证码已失效，请刷新后重试');
  challenges.delete(id);if(c.expiresAt<=now())throw fail('验证码已过期，请刷新后重试');
  const answer=typeof text==='string'&&text.length<=12?text.trim().toUpperCase():'';if(!/^[A-Z2-9]{5}$/.test(answer)||!timingSafeEqual(c.hash,digest(answer)))throw fail('验证码不正确，请重新输入');return true;
 }
 return {issue,verify};
}
function signupOwner(req){const raw=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookie+'='));const value=raw?.slice(cookie.length+1)||'';return /^[A-Za-z0-9_-]{32,64}$/.test(value)?value:'';}
export function installRegistrationRoutes(app,{register,onRegistered=()=>{},captchaService=createRegistrationCaptcha()}){
 app.get('/api/auth/captcha',async(req,res)=>{
  const owner=signupOwner(req)||randomBytes(24).toString('base64url');res.set('Cache-Control','no-store');res.cookie(cookie,owner,{httpOnly:true,sameSite:'strict',secure:req.secure,path:'/api/auth',maxAge:900000});
  res.json(await captchaService.issue(owner,{previousId:req.query.previous,ip:req.ip}));
 });
 app.post('/api/auth/register',async(req,res)=>{
  res.set('Cache-Control','no-store');captchaService.verify(signupOwner(req),req.body?.captchaId,req.body?.captchaText);
  const result=await register(req.body);onRegistered(res,result);res.json({user:result.user});
 });
}
