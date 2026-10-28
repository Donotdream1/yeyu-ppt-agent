import {test,expect} from '@playwright/test';
test.beforeEach(async({page,request})=>{let folders=await(await request.get('/api/workspace/folders')).json(),project=folders.items[0];if(!project)project=await(await request.post('/api/workspace/folders',{data:{name:'常规工作流验收'}})).json();await page.addInitScript(p=>{localStorage.setItem('yeyu:test-local-user:yeyu-folder',p.id);localStorage.setItem('yeyu:test-local-user:yeyu-folder-name',p.name);},project);});
test('资料准备、确认方案、修改需求后的旧方案失效',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const id='11111111-1111-4111-8111-111111111111',plan={title:'设备协同汇报',slides:[{kind:'cover',title:'设备协同汇报',bullets:['汇报范围']},{kind:'content',visual:'parallel',title:'工作机制',bullets:['岗位责任清晰'],materialRequest:{moduleCount:3}},{kind:'ending',title:'下一步计划',bullets:['验证工作成效']}]};
 await page.route('**/api/generate',async route=>{expect(route.request().postDataJSON().planningOnly).toBe(true);await route.fulfill({json:{id}});});
 await page.route('**/api/jobs/'+id,route=>route.fulfill({json:{id,status:'done',output:{planningOnly:true,plan}}}));
 await page.goto('/?v=23');await expect(page.getByRole('heading',{name:'这次准备讲什么？'})).toBeVisible();
 await page.getByRole('textbox',{name:'文档内容',exact:true}).fill('本报告介绍设备维护、岗位分工、问题排查与协同验证的工作流程，明确各岗位的工作职责。');
 await expect(page.getByRole('button',{name:'生成逐页方案',exact:true})).toBeEnabled();
 await page.screenshot({path:'test-output/ui-prepare.png',fullPage:true});
 await page.getByRole('button',{name:'生成逐页方案',exact:true}).click();await expect(page.getByRole('textbox',{name:'第2页标题'})).toHaveValue('工作机制');
 await expect(page.getByRole('navigation',{name:'PPT制作步骤'})).toHaveCount(0);
 await page.getByRole('button',{name:'编辑资料',exact:true}).click();await page.getByRole('textbox',{name:'文档内容',exact:true}).fill('本次文档已经更换，聚焦质量管理、改善结果与下一阶段落实计划，并提供真实的工作依据。');
 await page.getByRole('button',{name:'查看页面方案',exact:true}).click();await expect(page.getByText('文档或生成要求已修改，请重新规划，避免沿用旧方案。')).toBeVisible();await expect(page.getByRole('button',{name:'开始制作PPT',exact:true})).toBeDisabled();
 expect(errors).toEqual([]);
});
test('素材检索和详情仍可用，模板与历史作品可导航',async({page})=>{
 await page.goto('/?tab=library&v=23');await expect(page.locator('.mp-preview-button').first()).toBeVisible();await page.locator('.mp-preview-button').first().click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'关闭素材详情'}).click();
 await page.getByRole('button',{name:'我的模板',exact:true}).click();await expect(page.getByRole('heading',{name:'把常用模板准备好'})).toBeVisible();
 await page.getByRole('button',{name:'最近作品',exact:true}).click();await expect(page.locator('.history-card').first()).toBeVisible();await page.screenshot({path:'test-output/ui-history.png',fullPage:true});
});

test('创作工作台内完成方案、制作进度与预览，不再显示四步导航',async({page,request})=>{
 const id='22222222-2222-4222-8222-222222222222',output=await(await request.get('/api/outputs/aafcbc3e-6585-4a38-a83a-01f0fd00b9b9')).json();
 const plan={title:'工作台流程验收',slides:[{kind:'cover',title:'工作台流程验收',bullets:['汇报范围']},{kind:'content',title:'工作机制',bullets:['岗位责任清晰']},{kind:'ending',title:'下一步计划',bullets:['验证工作成效']}]};
 let planning=true,finish=false;
 await page.route('**/api/generate',async r=>{planning=r.request().postDataJSON().planningOnly;await r.fulfill({json:{id}});});
 await page.route('**/api/jobs/'+id,r=>r.fulfill({json:planning?{id,status:'done',output:{planningOnly:true,plan}}:finish?{id,status:'done',output}:{id,status:'running',progress:{totalPages:16,completedPages:[]}}}));
 await page.goto('/workspace');await page.getByLabel('文档内容',{exact:true}).fill('本报告介绍设备维护、岗位分工、问题排查与协同验证的工作流程，明确各岗位的工作职责。');
 await page.getByRole('button',{name:'生成逐页方案',exact:true}).click();await expect(page.getByLabel('第2页标题',{exact:true})).toHaveValue('工作机制');
 await expect(page.getByRole('navigation',{name:'PPT制作步骤'})).toHaveCount(0);await page.getByRole('button',{name:'开始制作PPT',exact:true}).click();
 await expect(page.getByText('正在把方案制作成PPT',{exact:true})).toBeVisible();finish=true;
 await expect(page.getByRole('link',{name:'下载 PPT',exact:true})).toBeVisible();await expect(page.getByLabel('本页修改要求',{exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'创作工作台',exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'PPT制作步骤'})).toHaveCount(0);
 await page.screenshot({path:'test-output/workbench-integrated-preview.png'});
});
test('PPT预览、全页预览和真实Hermes执行记录可用',async({page,request})=>{
 const history=await (await request.get('/api/outputs?limit=1')).json();const overview=await(await request.get('/api/hermes/overview')).json();let realTaskIndex=-1;for(let i=0;i<overview.tasks.items.length;i++){if(!overview.tasks.items[i].modelRequests)continue;const detail=await(await request.get('/api/hermes/tasks/'+overview.tasks.items[i].id)).json();if(detail.events?.length){realTaskIndex=i;break;}}expect(realTaskIndex).toBeGreaterThanOrEqual(0);expect(history.items.length).toBeGreaterThan(0);
 await page.goto('/?v=23&output='+history.items[0].id+'&page=2');await expect(page.getByRole('link',{name:'下载 PPT',exact:true})).toBeVisible();await expect(page.locator('.presentation-preview img')).toBeVisible();
 await page.screenshot({path:'test-output/ui-review.png',fullPage:true});await page.getByRole('button',{name:'全页预览',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.all-pages-grid button')).toHaveCount(history.items[0].pages);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Hermes 工作台',exact:true}).click();await expect(page.getByRole('heading',{name:'Hermes 工作台',exact:true})).toBeVisible();await page.getByRole('tab',{name:'任务运行',exact:true}).click();await expect(page.locator('.hermes-current-task')).toBeVisible();await page.getByRole('navigation',{name:'Hermes运行任务'}).getByRole('button').nth(realTaskIndex).click();await page.getByRole('tab',{name:'工具记录',exact:true}).click();await expect(page.locator('.hermes-event-table tbody tr').first()).toBeVisible();await page.screenshot({path:'test-output/ui-hermes.png',fullPage:true});await page.getByRole('tab',{name:'框架与技能',exact:true}).click();await expect(page.getByRole('heading',{name:'Hermes在本系统中的连接方式'})).toBeVisible();
});
test('移动端导航可用，准备页面不产生横向溢出',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/?v=23');await expect(page.getByRole('heading',{name:'这次准备讲什么？'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.getByRole('button',{name:'打开导航'}).click();await page.getByRole('dialog').getByRole('button',{name:'Hermes 工作台',exact:true}).click();await expect(page.getByRole('heading',{name:'Hermes 工作台',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);await page.screenshot({path:'test-output/ui-mobile.png',fullPage:true});
});
