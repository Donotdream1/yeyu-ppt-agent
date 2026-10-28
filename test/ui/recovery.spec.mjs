import {test,expect} from '@playwright/test';

test('逐页修改显示四个真实并行工作者及各自页码',async({page})=>{
 const id='99999999-9999-4999-8999-999999999999',workers=[3,4,5,6].map(n=>({id:`writer-page-${n}`,role:`writer-page-${n}`,pages:[n],status:'running'}));
 await page.route('**/api/jobs/'+id,route=>route.fulfill({json:{id,status:'running',phase:'每页独立智能体',progress:{stage:'writing',batchSize:1,concurrency:4,totalPages:8,completedPages:[1,2],activePages:[3,4,5,6],workers,failedPages:[]}}}));
 await page.route('**/api/jobs/'+id+'/previews',route=>route.fulfill({json:{status:'idle',pages:[],available:2}}));
 await page.goto('/?job='+id);const status=page.getByLabel('逐页智能体并行状态');await expect(status).toContainText('每页独立智能体 · 最多 4 页并行 · 当前 4 页运行');await expect(status.locator('.page-agent-card')).toHaveCount(4);for(const n of [3,4,5,6])await expect(status.getByText(`第 ${n} 页`,{exact:true})).toBeVisible();
});

test('失败页可在右侧人工选版，提交后恢复并进入整稿下载',async({page})=>{
 const id='55555555-5555-4555-8555-555555555555',outputId='66666666-6666-4666-8666-666666666666';
 const slides=Array.from({length:16},(_,i)=>({title:i===1?'目录':'页面'+(i+1),kind:i===1?'agenda':'content',bullets:['本页真实要点']}));
 const plan={title:'人工恢复测试',slides,templateId:'test'};let resumed=false,body;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/jobs/'+id,route=>route.fulfill({json:resumed?{id,status:'done',output:{id:outputId,title:'人工恢复测试',pages:16,url:'/test-download.pptx',plan,render:{status:'ready',pages:16}}}:{id,status:'failed',error:'已保存15/16页；第2页素材不适配',plan,progress:{stage:'materials',totalPages:16,completedPages:Array.from({length:16},(_,i)=>i+1).filter(n=>n!==2),failedPages:[{page:2,error:'素材不适配'}]}}}));
 await page.route('**/api/jobs/'+id+'/recovery?*',route=>route.fulfill({json:{id,revision:'rev-1',page:{number:2,title:'目录',kind:'agenda',bullets:['工作概况','重点工作']},failedPages:[{page:2,title:'目录',reason:'素材不适配'}],completedPages:Array.from({length:15},(_,i)=>i+3),totalPages:16,items:[{id:'material-five',sourceName:'五项目录素材.pptx',sourcePage:207,previewUrl:'/api/previews/test/207.png',selectable:true,recipe:'reflow',slots:10,warnings:[]},{id:'broken',sourceName:'缺少资源.pptx',sourcePage:3,selectable:false,reason:'缺少资源'}]}}));
 await page.route('**/api/jobs/'+id+'/resume',async route=>{body=route.request().postDataJSON();resumed=true;await route.fulfill({status:202,json:{id}});});
 await page.route('**/api/outputs/'+outputId,route=>route.fulfill({json:{id:outputId,title:'人工恢复测试',pages:16,plan,render:{status:'ready',pages:16}}}));
 await page.goto('/?v=27&job='+id);const panel=page.getByLabel('失败页人工选版');await expect(panel).toBeVisible();await expect(panel.getByText('15 页已完成并保留 · 共 16 页')).toBeVisible();
 await expect(panel.getByRole('button',{name:'选择设计：缺少资源.pptx 第3页'})).toBeDisabled();
 const next=panel.getByRole('button',{name:'使用此设计并继续',exact:true});await expect(next).toBeDisabled();await panel.getByRole('button',{name:'选择设计：五项目录素材.pptx 第207页'}).click();await expect(next).toBeEnabled();
 await panel.getByRole('button',{name:'放大查看素材'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();
 await page.screenshot({path:'test-output/ui-failure-recovery.png',fullPage:true});await next.click();await expect(page.getByRole('link',{name:'下载 PPT',exact:true})).toBeVisible();
 expect(body.manualSelection).toEqual({page:2,materialId:'material-five',recipe:'reflow',revision:'rev-1'});expect(errors).toEqual([]);
});

test('人工选版面板在移动端可用，没有横向溢出',async({page})=>{
 const id='77777777-7777-4777-8777-777777777777';await page.setViewportSize({width:390,height:844});
 await page.route('**/api/jobs/'+id,route=>route.fulfill({json:{id,status:'failed',error:'第2页未完成',progress:{totalPages:3,completedPages:[1,3],failedPages:[{page:2,error:'需要换材'}]}}}));
 await page.route('**/api/jobs/'+id+'/recovery?*',route=>route.fulfill({json:{id,revision:'r',page:{number:2,title:'目录',bullets:['第一章','第二章']},failedPages:[{page:2,reason:'需要换材'}],completedPages:[1,3],totalPages:3,items:[]}}));
 await page.goto('/?job='+id);await expect(page.getByLabel('失败页人工选版')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('失败任务下方可查看真实成稿预览、切页和放大',async({page})=>{
 const id='88888888-8888-4888-8888-888888888888';let starts=0;
 await page.route('**/actual-page-*.png',route=>route.fulfill({contentType:'image/png',path:'data/previews/1d10e7a1fdc062b8/64.png'}));
 await page.route('**/api/jobs/'+id,route=>route.fulfill({json:{id,status:'failed',error:'第2页未完成',progress:{totalPages:3,completedPages:[1,3],failedPages:[{page:2,error:'需要换材'}]}}}));
 await page.route('**/api/jobs/'+id+'/recovery?*',route=>route.fulfill({json:{id,revision:'r',page:{number:2,title:'目录',bullets:['章节']},failedPages:[{page:2,reason:'需要换材'}],completedPages:[1,3],totalPages:3,items:[]}}));
 await page.route('**/api/jobs/'+id+'/previews',route=>{if(route.request().method()==='POST')starts++;return route.fulfill({json:{status:'ready',pages:[{page:1,title:'封面',url:'/actual-page-1.png'},{page:3,title:'内容页',url:'/actual-page-3.png',needsReview:true}]}});});
 await page.goto('/?job='+id);const preview=page.getByLabel('已生成页面实际效果');await expect(preview).toBeVisible();await expect(preview.getByRole('img',{name:'第1页实际生成效果'})).toHaveAttribute('src','/actual-page-1.png');
 await preview.scrollIntoViewIfNeeded();const panelBounds=await page.getByLabel('失败页人工选版').boundingBox(),previewBounds=await preview.boundingBox();expect(panelBounds.y+panelBounds.height).toBeLessThanOrEqual(previewBounds.y);
 await preview.getByRole('button',{name:'查看第3页实际效果',exact:true}).click();await expect(preview.getByRole('img',{name:'第3页实际生成效果'})).toHaveAttribute('src','/actual-page-3.png');await preview.getByRole('button',{name:'放大查看第3页实际效果',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');expect(starts).toBe(1);
});
