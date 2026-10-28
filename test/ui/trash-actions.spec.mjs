import {test,expect} from '@playwright/test';
test('回收站只保留一个批量删除入口，确认后按当前选择删除或清空',async({page})=>{
 let items=[{id:'11111111-1111-4111-8111-111111111111',title:'演示甲',pages:3,thumbnail:'/logo.svg',url:'/fixture-a.pptx'},{id:'22222222-2222-4222-8222-222222222222',title:'演示乙',pages:3,thumbnail:'/logo.svg',url:'/fixture-b.pptx'}];const purges=[];
 await page.route('**/api/workspace/folders',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/outputs?*',r=>{const trash=new URL(r.request().url()).searchParams.get('trash')==='true';return r.fulfill({json:{items:trash?items:[],total:trash?items.length:0,pages:1}});});
 await page.route('**/api/outputs/purge',r=>{const body=r.request().postDataJSON();purges.push(body);items=body.all?[]:items.filter(i=>!body.ids.includes(i.id));return r.fulfill({json:{ok:true}});});
 await page.goto('/history');await page.getByRole('button',{name:'回收站',exact:true}).click();const bar=page.locator('.selection-actionbar');await expect(bar.getByRole('button',{name:'清空回收站',exact:true})).toBeEnabled();await expect(bar.getByRole('button')).toHaveCount(1);
 await page.getByLabel('选择作品演示甲',{exact:true}).check();await expect(bar.getByRole('button',{name:'永久删除所选（1）',exact:true})).toBeEnabled();await expect(bar.getByRole('button',{name:'清空回收站',exact:true})).toHaveCount(0);await bar.getByRole('button').click();await page.getByRole('button',{name:'取消',exact:true}).click();expect(purges).toHaveLength(0);
 await bar.getByRole('button').click();await page.getByRole('button',{name:'确认永久删除',exact:true}).click();await expect.poll(()=>purges.length).toBe(1);expect(purges[0]).toEqual({ids:['11111111-1111-4111-8111-111111111111']});await expect(page.getByLabel('选择作品演示甲',{exact:true})).toHaveCount(0);
 await bar.getByRole('button',{name:'清空回收站',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('搜索结果之外');await page.getByRole('button',{name:'确认永久删除',exact:true}).click();await expect.poll(()=>purges.length).toBe(2);expect(purges[1]).toEqual({all:true});await expect(page.getByText('回收站为空',{exact:true})).toBeVisible();await expect(bar.getByRole('button')).toBeDisabled();
});
