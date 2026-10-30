import PostalMime from 'postal-mime';
import {ImapFlow} from 'imapflow';
import nodemailer from 'nodemailer';
import {createHash} from 'node:crypto';
import {extractDocument} from './documents.mjs';
import {text} from './office-store.mjs';

export async function importOfficeSource(file){
 const name=Buffer.from(file.originalname,'latin1').toString('utf8');if(file.buffer.length>12*1024*1024)throw Error('资料文件最多12MB');
 if(/\.eml$/i.test(name)){const mail=await PostalMime.parse(file.buffer);return {title:mail.subject||name,kind:'email',text:['发件人：'+(mail.from?.address||'待核查'),'邮件时间：'+(mail.date||'待核查'),mail.text||String(mail.html||'').replace(/<[^>]*>/g,' ')].join('\n').slice(0,50000),externalId:'eml:'+createHash('sha256').update(file.buffer).digest('hex')};}
 const out=await extractDocument(file.buffer,name);if(out.text.length>50000)throw Error('这份文档超过5万字，请拆分后导入；不会静默截断原文');return {title:name,kind:'document',text:out.text};
}
export async function syncOfficeMail(service,user){
 const settings=await service.settings(user,true),s=settings.mail;if(!s?.host||!s.password)throw Error('请先配置IMAP邮箱服务器和授权码');
 const client=new ImapFlow({host:s.host,port:993,secure:true,auth:{user:s.username,pass:s.password},logger:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});const items=[];
 try{await client.connect();const lock=await client.getMailboxLock('INBOX');try{const total=client.mailbox.exists;if(total)for await(const message of client.fetch(Math.max(1,total-19)+':*',{uid:true,envelope:true,source:{start:0,maxLength:512000}})){const raw=await PostalMime.parse(message.source);const body=(raw.text||String(raw.html||'').replace(/<[^>]*>/g,' ')).slice(0,45000);const item=await service.addSource(user,{title:raw.subject||'(无主题)',kind:'email',text:'邮件时间：'+(raw.date||'待明确')+'\n发件人：'+(raw.from?.address||'待明确')+'\n'+body,externalId:'imap:'+createHash('sha256').update(s.host+'|'+s.username+'|'+String(client.mailbox.uidValidity)+'|'+message.uid).digest('hex')});items.push(item);} }finally{lock.release();}}catch{throw Error('邮箱同步失败，请核对IMAP服务器、账号授权码及连接权限');}finally{await client.logout().catch(()=>{});}
 return {items,count:items.length};
}
export async function sendOfficeMail(service,user,docId,input,{createTransport=nodemailer.createTransport}={}){
 const doc=await service.document(user,docId);if(doc.kind!=='writing')throw Error('只能发送办公撰写中确认的文稿');if(input.confirm!==true)throw Error('请核对收件人和正文后确认发送');if(!Array.isArray(input.to)||!input.to.length||input.to.length>20||input.to.some(v=>typeof v!=='string'||!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v)))throw Error('收件人地址无效，最多20个');
 const setting=(await service.settings(user,true)).mail;if(!setting?.smtpHost||!setting.password)throw Error('请先配置SMTP发信服务器和授权码');
 const token=createHash('sha256').update(JSON.stringify({id:doc.id,to:input.to,body:doc.body,title:doc.title})).digest('hex');let reserved=false;
 await service.update(d=>{const live=d.documents.find(x=>x.id===doc.id&&x.ownerId===user.id);if(live.sending)throw Error('邮件已提交发送；请查看发送记录，勿重复发送');if(live.sendToken===token)throw Error('此版本已发送，请勿重复发送');live.sending=true;reserved=true;});
 const transport=createTransport({host:setting.smtpHost,port:setting.smtpPort,secure:setting.smtpPort===465,requireTLS:setting.smtpPort===587,auth:{user:setting.username,pass:setting.password},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,disableFileAccess:true,disableUrlAccess:true});
 try{const info=await transport.sendMail({from:setting.username,to:input.to,subject:doc.title.replace(/[\r\n]/g,' '),text:doc.body,messageId:'<'+doc.id+'.'+token.slice(0,12)+'@xuzhen.local>'});await service.update(d=>{const live=d.documents.find(x=>x.id===doc.id&&x.ownerId===user.id);live.sending=false;live.sendToken=token;live.sent={at:new Date().toISOString(),to:input.to,messageId:info.messageId,accepted:info.accepted,rejected:info.rejected};});return {ok:true,accepted:info.accepted,rejected:info.rejected};}catch{if(reserved)await service.update(d=>{const live=d.documents.find(x=>x.id===doc.id&&x.ownerId===user.id);if(live){live.sending=false;live.sendError='发送结果未确认，请在邮箱发件记录中核对后再操作';}});throw Error('SMTP发送未确认，请核对邮箱发件记录后再决定是否重试');}finally{transport.close();}
}
export async function transcribeOfficeAudio(service,user,file){
 if(!file||file.buffer.length>25*1024*1024||!(/\.(wav|mp3|m4a|webm|ogg|flac)$/i.test(file.originalname)))throw Error('支持25MB以内的WAV、MP3、M4A、WebM、OGG、FLAC');
 const s=(await service.settings(user,true)).speech;if(!s)throw Error('请先配置语音识别服务；聊天模型连接不等于语音识别服务');const form=new FormData();form.append('file',new Blob([file.buffer],{type:file.mimetype||'application/octet-stream'}),'recording'+file.originalname.slice(file.originalname.lastIndexOf('.')));if(s.protocol==='compatible')form.append('model',s.model);form.append('response_format','json');form.append('language',s.protocol==='whispercpp'?'zh':'zh');
 let r;try{r=await fetch(s.url,{method:'POST',headers:s.password?{Authorization:'Bearer '+s.password}:{},body:form,signal:AbortSignal.timeout(180000),redirect:'error'});}catch{throw Error('语音服务连接失败或超时，请检查地址和服务状态');}if(!r.ok)throw Error('语音服务返回HTTP '+r.status+'，请检查识别服务兼容性');const length=Number(r.headers.get('content-length')||0);if(length>2e6)throw Error('语音响应过大');const raw=await r.text();if(raw.length>2e6)throw Error('语音响应过大');let out;try{out=JSON.parse(raw);}catch{throw Error('语音服务应返回JSON格式');}const transcript=text(out.text||out.transcription||'',50000);if(!transcript)throw Error('未识别到文字');return {text:transcript};
}
