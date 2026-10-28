import {test,expect} from '@playwright/test';
const output='aafcbc3e-6585-4a38-a83a-01f0fd00b9b9',folder='99999999-9999-4999-8999-999999999999';
test('点击原生对象后限定智能体修改范围，切页清空选区',async({page})=>{
 let sent;const root=output;
 await page.route('**/api/page-workspaces/'+root,r=>r.fulfill({json:{rootId:root,headOutputId:output,revision:0,jobs:[]}}));
 await page.route('**/api/page-sessions?*',r=>{const n=Number(new URL(r.request().url()).searchParams.get('page'));return r.fulfill({json:{id:root+'-p'+(n+1),rootId:root,page:n,revision:0,messages:[],uploads:[],inspection:{fingerprint:'scene-'+n,shapes:[{id:7,type:'text',text:'所选文字',box:{x:.2,y:.3,w:.3,h:.1}},{id:8,type:'text',text:'其他文字',box:{x:.6,y:.3,w:.3,h:.1}}]}}});});
 await page.route('**/api/page-sessions/*/messages',async r=>{sent=r.request().postDataJSON();await r.fulfill({status:202,json:{job:{id:'selection-job',page:0,status:'queued',phase:'等待智能体'}}});});
 await page.goto('/?output='+output+'&page=1');await page.getByRole('button',{name:'选择元素',exact:true}).click();await expect(page.getByLabel('选择页面对象')).toBeVisible();
 const b=await page.locator('.native-hit-layer').boundingBox();await page.mouse.click(b.x+b.width*.3,b.y+b.height*.35);await expect(page.locator('.native-selected-object')).toHaveCount(1);await expect(page.locator('.composer-selection')).toContainText('1 个所选对象');
 await page.getByRole('textbox',{name:'本页修改要求',exact:true}).fill('将选中的文字改为重点工作，其他部分不动。');await page.getByRole('button',{name:'发送本页修改要求'}).click();await expect.poll(()=>sent?.selection).toEqual({shapeIds:[7],fingerprint:'scene-0'});
 await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.getByLabel('第2页智能体对话')).toBeVisible();await expect(page.locator('.native-selected-object')).toHaveCount(0);
});
test('素材详情位于屏幕内并可预览，搜索演示只有圆角边界',async({page})=>{
 await page.goto('/library');await page.locator('.mp-preview-button').first().click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 const b=await dialog.boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(1441);expect(b.y+b.height).toBeLessThanOrEqual(1051);expect(await dialog.evaluate(n=>getComputedStyle(n).position)).toBe('fixed');await expect(dialog.locator('.mp-preview.large img')).toBeVisible();await page.getByRole('button',{name:'关闭素材详情'}).click();
 await page.getByRole('button',{name:'搜索演示',exact:false}).first().click();const search=page.getByRole('dialog');await expect(search).toBeVisible();await expect(search.locator('.history-card').first()).toBeVisible();const styles=await search.evaluate(n=>({radius:getComputedStyle(n).borderRadius,clip:getComputedStyle(n).clipPath,overflow:getComputedStyle(n).overflow}));expect(styles).toEqual({radius:'18px',clip:'inset(0px round 18px)',overflow:'hidden'});
 await page.screenshot({path:'test-output/rounded-search-final.png'});
});
test('作品支持文件夹新建移动、删除恢复，并在文件夹内新建PPT',async({page})=>{
 let folders=[],folderId=null,deleted=false,createFolderBody;
 const item={id:output,title:'文件夹验收作品',pages:16,thumbnail:'/api/previews/'+output+'/1.png',url:'/api/files/'+output+'.pptx'};
 await page.route('**/api/workspace/folders',async r=>{if(r.request().method()==='POST'){createFolderBody=r.request().postDataJSON();folders=[{id:folder,name:createFolderBody.name}];await r.fulfill({status:201,json:folders[0]});}else await r.fulfill({json:{items:folders}});});
 await page.route(/\/api\/outputs\?/,r=>{const q=new URL(r.request().url()).searchParams,inTrash=q.get('trash')==='true',fid=q.get('folderId')||'all';const items=inTrash===deleted&&(fid==='all'||fid===(folderId||'unfiled'))?[{...item,folderId}]:[];return r.fulfill({json:{items,total:items.length,page:1,pages:1}});});
 await page.route('**/api/outputs/'+output+'/organization',async r=>{folderId=r.request().postDataJSON().folderId;await r.fulfill({json:{ok:true}});});
 await page.route('**/api/outputs/'+output,r=>{if(r.request().method()==='DELETE'){deleted=true;return r.fulfill({json:{ok:true}});}return r.continue();});
 await page.route('**/api/outputs/'+output+'/restore',r=>{deleted=false;return r.fulfill({json:{ok:true}});});
 await page.goto('/history');await page.getByRole('button',{name:'新建文件夹',exact:true}).click();await page.getByLabel('文件夹名称').fill('年度工作');await page.getByRole('button',{name:'选择文件夹',exact:true}).click();await page.getByRole('navigation',{name:'目录快捷位置'}).getByRole('button',{name:'我的项目',exact:true}).click();await page.getByRole('button',{name:'选择此文件夹',exact:true}).click();await page.getByRole('button',{name:'创建项目',exact:true}).click();await expect(page.getByLabel('作品文件夹').getByRole('button',{name:'年度工作',exact:true})).toBeVisible();expect(createFolderBody.name).toBe('年度工作');expect(createFolderBody.parentPath).toBeTruthy();
 await page.getByLabel('文件夹验收作品所在文件夹').click();await page.locator('[role=option][data-value="'+folder+'"]').click();await expect.poll(()=>folderId).toBe(folder);await page.getByLabel('作品文件夹').getByRole('button',{name:'年度工作',exact:true}).click();await expect(page.locator('.history-card')).toHaveCount(1);
 await page.getByRole('button',{name:'删除文件夹验收作品',exact:true}).click();await expect(page.locator('.history-card')).toHaveCount(0);await page.getByRole('button',{name:'回收站',exact:true}).click();await page.getByRole('button',{name:'恢复文件夹验收作品',exact:true}).click();await expect(page.locator('.history-card')).toHaveCount(0);
 await page.getByLabel('作品文件夹').getByRole('button',{name:'年度工作',exact:true}).click();await page.getByRole('button',{name:'新建PPT',exact:true}).click();await expect(page).toHaveURL(/\/workspace$/);await expect(page.locator('.workspace-folder-context')).toContainText('年度工作');
});
