import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
test('科研原生版式可预览全部页面、复制编辑、绑定PPT，并保存为个人版式',async({page,request})=>{
 const list=await(await request.get('/api/style-skills')).json(),base=list.items.find(s=>s.id==='research-defense');expect(base.nativeTemplate.pages).toHaveLength(12);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/styles');
 await page.getByRole('button',{name:'查看风格'+base.name,exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('版式默认页数')).toHaveValue('12');await dialog.getByText('查看全部原生版式（12页）').click();await expect(dialog.locator('.layout-page-grid img')).toHaveCount(12);
 await dialog.getByRole('button',{name:'复制并编辑'}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:'新建版式',exact:true})).toBeVisible();
 const unique='科研版式验收-'+Date.now();await page.getByLabel('新建版式名称',{exact:true}).fill(unique);await page.getByLabel('新版式提示词',{exact:true}).fill(base.content+'\n验收专用规则：主标题控制在18字以内。');
 await page.getByLabel('参考PPT',{exact:true}).setInputFiles({name:'蓝白科研参考.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:await fs.readFile(path.resolve('data/sources',base.sourceId+'.pptx'))});
 const response=page.waitForResponse(r=>r.url().endsWith('/api/style-skills/create')&&r.request().method()==='POST');await page.getByRole('button',{name:'保存并启用',exact:true}).click();const created=await(await response).json();expect(created.nativeTemplate.pages).toHaveLength(12);expect(created.content).toContain('18字');expect(created.fontPolicy).toEqual(base.fontPolicy);
 await expect(page.getByRole('dialog').getByRole('heading',{name:unique,exact:true})).toBeVisible();await expect(page.getByLabel('版式Skill内容')).toHaveValue(created.content.replace(/\r\n/g,'\n'));await page.screenshot({path:'test-output/native-layout-style-dialog.png',fullPage:true});
 await page.getByRole('button',{name:'用于新演示',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(errors).toEqual([]);
 await request.post('/api/style-skills/batch-delete',{data:{ids:[created.id]}});
});
