import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('**/api/auth/session',r=>r.fulfill({json:{user:null,setupRequired:false}}));});
test('注册显示随机图形验证码，可点击刷新，错误提交后自动换图',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let submitted;
 await page.route('**/api/auth/register',async r=>{submitted=r.request().postDataJSON();await r.fulfill({status:400,json:{error:'验证码不正确，请重新输入'}});});
 await page.goto('/register');const image=page.getByRole('img',{name:'随机图形验证码',exact:true}),input=page.getByLabel('验证码',{exact:true});await expect(image).toBeVisible();await expect(page.getByRole('button',{name:'注册并继续',exact:true})).toBeDisabled();const first=await image.getAttribute('src');await input.fill('abcde');await expect(input).toHaveValue('ABCDE');await page.getByRole('button',{name:'刷新注册验证码',exact:true}).click();await expect(image).toHaveAttribute('src',/^data:image\/png;base64,/);await expect.poll(()=>image.getAttribute('src')).not.toBe(first);await expect(input).toHaveValue('');
 await page.getByLabel('账号',{exact:true}).fill('captcha-user');await page.getByLabel('密码',{exact:true}).fill('strong-password-123');await input.fill('ABCDE');const previous=await image.getAttribute('src');await page.getByRole('button',{name:'注册并继续',exact:true}).click();await expect(page.getByRole('alert')).toContainText('验证码不正确');await expect(input).toHaveValue('');await expect.poll(()=>image.getAttribute('src')).not.toBe(previous);expect(submitted.captchaText).toBe('ABCDE');expect(submitted.captchaId).toBeTruthy();expect(errors).toEqual([]);await page.screenshot({path:'test-output/registration-captcha.png'});
});
test('验证码读取失败可重试，登录页不增加验证码',async({page})=>{
 let calls=0;await page.route('**/api/auth/captcha*',async r=>{calls++;if(calls===1)return r.fulfill({status:503,json:{error:'验证码暂不可用'}});await r.continue();});
 await page.goto('/login');await expect(page.getByRole('heading',{name:'欢迎回来',exact:true})).toBeVisible();expect(calls).toBe(0);await expect(page.getByLabel('验证码',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'注册',exact:true}).click();await expect(page.getByRole('alert')).toContainText('验证码暂不可用');await page.getByRole('button',{name:'刷新注册验证码',exact:true}).click();await expect(page.getByRole('img',{name:'随机图形验证码',exact:true})).toBeVisible();await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByLabel('验证码',{exact:true})).toHaveCount(0);
});
test('手机端验证码图片与输入框不产生横向溢出',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/register');await expect(page.getByRole('img',{name:'随机图形验证码',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'test-output/registration-captcha-mobile.png',fullPage:true});
});
