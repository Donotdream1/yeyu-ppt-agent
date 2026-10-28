import {test,expect} from '@playwright/test';

test('技能设置展示全部真实技能，逐页编辑与提示词编辑均可用',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const skills=await(await request.get('/api/skills')).json();
 let saved;
 await page.route('**/api/skills/page-edit',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{ok:true}});});
 await page.goto('/settings/skills');
 await expect(page.getByRole('tab',{name:'技能与规则',exact:true})).toHaveAttribute('data-state','active');
 await expect(page.locator('.skill-card')).toHaveCount(skills.items.length);
 expect(await page.locator('.rules-tabs>[data-slot=tabs-list]').evaluate(el=>getComputedStyle(el).flexDirection)).toBe('row');
 await page.getByRole('button',{name:/逐页编辑技能/}).click();
 const editor=page.getByLabel('逐页编辑技能配置',{exact:true});
 await expect(editor).toHaveValue(skills.items.find(s=>s.name==='page-edit').content);
 await editor.fill((await editor.inputValue())+'\n回归测试：仅拦截保存，不修改真实技能文件。');
 await page.getByRole('button',{name:'保存技能',exact:true}).click();await expect.poll(()=>saved?.content).toContain('回归测试');
 await expect(page.getByText('技能已保存，将用于下一次生成或换版',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'PPT撰写规则',exact:true}).click();await expect(page.getByLabel('PPT撰写提示词',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'图表规范',exact:true}).click();await expect(page.getByLabel('图表绘制提示词',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'技能配置',exact:true}).click();await expect(page.locator('.skill-card')).toHaveCount(skills.items.length);
 expect(errors).toEqual([]);await page.screenshot({path:'test-output/skills-settings-fixed.png'});
});

test('新增未知技能使用默认图标，不会导致白屏',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/skills',r=>r.fulfill({json:{items:[{name:'future-skill',title:'新技能测试',content:'---\nname: future-skill\n---\n测试内容'}]}}));
 await page.goto('/settings/skills');await expect(page.getByRole('button',{name:/新技能测试/})).toBeVisible();await expect(page.getByLabel('新技能测试配置',{exact:true})).toHaveValue(/测试内容/);expect(errors).toEqual([]);
});

test('技能读取失败可以重试，不会卡在加载状态',async({page})=>{
 let attempts=0;await page.route('**/api/skills',r=>++attempts===1?r.fulfill({status:503,json:{error:'技能服务暂时不可用'}}):r.fulfill({json:{items:[{name:'ppt-writing',title:'PPT 撰写技能',content:'---\nname: ppt-writing\n---'}]}}));
 await page.goto('/settings/skills');await expect(page.getByRole('alert')).toContainText('技能服务暂时不可用');await page.getByRole('button',{name:'重新加载技能',exact:true}).click();await expect(page.getByLabel('PPT 撰写技能配置',{exact:true})).toBeVisible();
});

test('空技能列表显示空状态，手机端仍可查看技能配置',async({page})=>{
 await page.route('**/api/skills',r=>r.fulfill({json:{items:[]}}));await page.goto('/settings/skills');await expect(page.getByText('暂无可用技能',{exact:true})).toBeVisible();
 await page.unroute('**/api/skills');await page.setViewportSize({width:390,height:844});await page.reload();await expect(page.locator('.skill-card').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
