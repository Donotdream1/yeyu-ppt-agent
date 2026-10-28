import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createRegistrationCaptcha} from '../server/registration-captcha.mjs';
const fixture=options=>createRegistrationCaptcha({randomIndex:()=>0,render:async()=>Buffer.from('test-image'),...options});
test('验证码不返回明文答案，忽略大小写，成功或失败后均不能复用',async()=>{
 const c=fixture(),challenge=await c.issue('browser-a');assert.equal(challenge.length,5);assert.equal(challenge.answer,undefined);assert.equal(challenge.code,undefined);assert.equal(c.verify('browser-a',challenge.id,'22222'),true);assert.throws(()=>c.verify('browser-a',challenge.id,'22222'),/失效/);
 const wrong=await c.issue('browser-a');assert.throws(()=>c.verify('browser-a',wrong.id,'AAAAA'),/不正确/);assert.throws(()=>c.verify('browser-a',wrong.id,'22222'),/失效/);
 const alpha=createRegistrationCaptcha({randomIndex:()=>8,render:async()=>Buffer.from('test-image')});const a=await alpha.issue('browser-a');assert.equal(alpha.verify('browser-a',a.id,'aaaaa'),true);
});
test('验证码绑定浏览器，刷新使旧图失效，过期不能注册',async()=>{
 let time=0;const c=fixture({now:()=>time,ttlMs:300000}),first=await c.issue('a');assert.throws(()=>c.verify('b',first.id,'22222'),/失效/);assert.equal(c.verify('a',first.id,'22222'),true);
 const old=await c.issue('a'),fresh=await c.issue('a',{previousId:old.id});assert.throws(()=>c.verify('a',old.id,'22222'),/失效/);time=300001;assert.throws(()=>c.verify('a',fresh.id,'22222'),/过期/);
});
test('刷新频率与内存容量有上限，不接受空或畸形验证码',async()=>{
 let time=0;const c=fixture({now:()=>time,issueLimit:2,maxEntries:1}),a=await c.issue('a',{ip:'same-ip'}),b=await c.issue('a',{ip:'same-ip'});assert.throws(()=>c.verify('a',a.id,'22222'),/失效/);await assert.rejects(c.issue('a',{ip:'same-ip'}),e=>e.status===429);assert.throws(()=>c.verify('a',b.id,{}),/不正确/);time=60001;assert.ok((await c.issue('a',{ip:'same-ip'})).id);
});
test('真实验证码输出PNG图片，每次生成新的随机图片和标识',async()=>{
 const c=createRegistrationCaptcha(),a=await c.issue('a'),b=await c.issue('a');assert.notEqual(a.id,b.id);assert.notEqual(a.image,b.image);const metadata=await sharp(Buffer.from(a.image.split(',')[1],'base64')).metadata();assert.equal(metadata.format,'png');assert.equal(metadata.width,176);assert.equal(metadata.height,52);
});
