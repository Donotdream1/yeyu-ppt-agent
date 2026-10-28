import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {installRegistrationRoutes,createRegistrationCaptcha} from '../server/registration-captcha.mjs';
import {createLocalAuth} from '../server/local-auth.mjs';
test('注册接口强制校验随机图形验证码，拒绝绕过、跨浏览器和重放',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'yeyu-captcha-')),auth=createLocalAuth({directory}),app=express();app.use(express.json());
 installRegistrationRoutes(app,{register:auth.register,captchaService:createRegistrationCaptcha({randomIndex:()=>0})});app.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 const register=(body,cookie)=>fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 try{
  assert.equal((await register({username:'first-owner',password:'long-password'})).status,400);assert.equal(await auth.hasUsers(),false);
  const image=await fetch(base+'/api/auth/captcha'),captcha=await image.json(),cookie=image.headers.get('set-cookie').split(';')[0];assert.match(image.headers.get('set-cookie'),/HttpOnly/);assert.match(image.headers.get('set-cookie'),/SameSite=Strict/);assert.match(image.headers.get('cache-control'),/no-store/);assert.match(captcha.image,/^data:image\/png;base64,/);assert.equal(captcha.answer,undefined);
  assert.equal((await register({username:'first-owner',password:'long-password',captchaId:captcha.id,captchaText:'22222'})).status,400);
  const wrong=await register({username:'first-owner',password:'long-password',captchaId:captcha.id,captchaText:'AAAAA'},cookie);assert.equal(wrong.status,400);assert.equal(await auth.hasUsers(),false);
  assert.equal((await register({username:'first-owner',password:'long-password',captchaId:captcha.id,captchaText:'22222'},cookie)).status,400);
  const newer=await fetch(base+'/api/auth/captcha',{headers:{Cookie:cookie}}),fresh=await newer.json();const accepted=await register({username:'first-owner',password:'long-password',captchaId:fresh.id,captchaText:'22222'},cookie);assert.equal(accepted.status,200);assert.equal((await accepted.json()).user.role,'owner');assert.equal(await auth.hasUsers(),true);
  assert.equal((await register({username:'second-user',password:'long-password',captchaId:fresh.id,captchaText:'22222'},cookie)).status,400);
 }finally{await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});
