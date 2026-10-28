import {test,expect} from '@playwright/test';
const output='a6238ec1-b891-4a49-9d26-300ea80a1b40';
const materials=round=>Array.from({length:5},(_,i)=>({id:`material-${round}-${i}`,title:`流程方案${round}-${i}`,reason:'三个节点对应需求、验证与反馈，文字容量适合当前页',sourceName:'推荐素材.pptx',page:i+1,thumbnail:'/logo.svg'}));
test('打开推荐时调用AI选5页，刷新排除上一轮，选择时只修改当前页',async({page,request})=>{
 const skills=await(await request.get('/api/skills')).json();expect(skills.items.some(s=>s.name==='huashu-design')).toBe(false);
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/material-recommendations',async r=>{requests.push(r.request().postDataJSON());await r.fulfill({json:{items:materials(requests.length),engine:'Hermes + DeepSeek'}});});
 let chosen;const job='99999999-9999-4999-8999-999999999999';await page.route('**/api/replace-page-material-job',async r=>{chosen=r.request().postDataJSON();await r.fulfill({json:{id:job}});});await page.route('**/api/jobs/'+job,r=>r.fulfill({json:{id:job,status:'failed',error:'测试停止：不修改真实文件'}}));
 await page.goto('/?output='+output+'&page=3');await expect(page.getByLabel('本页修改要求',{exact:true})).toBeVisible();expect(requests).toHaveLength(0);
 await page.getByRole('button',{name:/推荐设计/}).click();await expect(page.locator('.recommendation-card')).toHaveCount(5);expect(requests[0].ai).toBe(true);expect(requests[0].excludeIds).toEqual([]);await expect(page.locator('.recommendation-reason').first()).toContainText('三个节点');await expect(page.getByRole('button',{name:'素材不合适？生成5个新设计',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'刷新推荐',exact:true}).click();await expect(page.locator('.recommendation-card').first()).toContainText('流程方案2-0');expect(requests[1].excludeIds).toEqual(materials(1).map(c=>c.id));
 await page.locator('.recommendation-card').first().click();await expect.poll(()=>chosen?.componentId).toBe('material-2-0');expect(chosen.page).toBe(2);expect(errors).toEqual([]);
});


test('侧栏在顶部展开收起，记住本次选择，收起时文字不外溢',async({page})=>{
 await page.goto('/workspace');const sidebar=page.getByRole('complementary',{name:'主导航侧栏',exact:true});const expand=page.getByRole('button',{name:'展开侧栏',exact:true});await expand.hover();await expect(expand).toHaveAttribute('aria-expanded','false');await expand.click();
 await expect(page.getByRole('button',{name:'收起侧栏',exact:true})).toHaveAttribute('aria-expanded','true');await expect.poll(async()=>Math.round((await sidebar.boundingBox()).width)).toBe(248);const a=await page.getByRole('button',{name:'收起侧栏',exact:true}).boundingBox();expect(a.y).toBeLessThan(65);await page.reload();await expect(page.getByRole('button',{name:'收起侧栏',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'收起侧栏',exact:true}).click();await expect.poll(async()=>Math.round((await sidebar.boundingBox()).width)).toBe(64);expect(await sidebar.locator('.sidebar-item-label').first().evaluate(el=>el.getBoundingClientRect().width)).toBe(0);await page.screenshot({path:'test-output/sidebar-collapsed-updated.png'});
 await page.getByRole('button',{name:'展开侧栏',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'收起侧栏',exact:true})).toBeVisible();await page.screenshot({path:'test-output/sidebar-expanded-updated.png'});
});
