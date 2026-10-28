import {test,expect} from '@playwright/test';

test('已保存演示偏好的账号可以登录、修改密度并将偏好用于生成',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let user={id:'test-local-user',username:'test',displayName:'偏好回归测试',role:'owner',preferences:{presentation:{templateId:'',styleSkillId:'native-material',pageCount:12,layoutDensity:'balanced'}}};
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user,setupRequired:false}}));
 await page.route('**/api/auth/profile',async r=>{user={...user,preferences:{...user.preferences,...r.request().postDataJSON().preferences}};await r.fulfill({json:{user}});});
 const folders=await(await request.get('/api/workspace/folders')).json();
 const project=folders.items[0]||await(await request.post('/api/workspace/folders',{data:{name:'偏好回归测试'}})).json();
 await page.addInitScript(p=>{localStorage.setItem('yeyu:test-local-user:yeyu-folder',p.id);localStorage.setItem('yeyu:test-local-user:yeyu-folder-name',p.name);},project);
 await page.goto('/settings/presentation');
 await expect(page.getByLabel('默认页面密度',{exact:true})).toHaveText('均衡布局');
 await page.getByLabel('默认页面密度',{exact:true}).click();await page.getByRole('option',{name:'宽松留白',exact:true}).click();
 await page.getByRole('button',{name:'保存演示偏好',exact:true}).click();await expect(page.getByRole('status')).toContainText('演示偏好已保存');
 expect(user.preferences.presentation.layoutDensity).toBe('spacious');
 await page.reload();await expect(page.getByLabel('默认页面密度',{exact:true})).toHaveText('宽松留白');
 await expect(page.getByLabel('默认演示页数',{exact:true})).toHaveText('12页');
 await page.goto('/styles');await expect(page.getByRole('button',{name:'用户菜单',exact:true})).toBeVisible();
 let generation;
 await page.route('**/api/generate',async r=>{generation=r.request().postDataJSON();await r.fulfill({status:400,json:{error:'回归测试停止：不实际生成PPT'}});});
 await page.goto('/workspace');await page.getByLabel('文档内容',{exact:true}).fill('本报告介绍设备维护、岗位分工、问题排查与协同验证的工作流程，明确各岗位的工作职责。');
 await page.getByRole('button',{name:'生成逐页方案',exact:true}).click();
 await expect.poll(()=>generation?.layoutDensity).toBe('spacious');expect(generation.pageCount).toBe(12);
 expect(errors).toEqual([]);
});
