import {test,expect} from '@playwright/test';
const member={id:'test-local-user',username:'member',displayName:'普通用户',role:'member',preferences:{}};
test('普通用户无素材库入口，直接访问或后退到旧链接均回到工作台',async({page})=>{
 const requested=[];await page.route('**/api/auth/session',r=>r.fulfill({json:{user:member,setupRequired:false}}));
 page.on('request',r=>{if(/\/api\/(material-pages|components)(?:\?|$)/.test(r.url()))requested.push(r.url());});
 for(const url of ['/library','/?tab=library']){await page.goto(url);await expect(page).toHaveURL(/\/workspace$/);await expect(page.getByRole('button',{name:'单页素材库',exact:true})).toHaveCount(0);await expect(page.getByLabel('文档内容',{exact:true})).toBeVisible();}
 await page.evaluate(()=>{history.pushState(null,'','/library');window.dispatchEvent(new PopStateEvent('popstate'));});await expect(page).toHaveURL(/\/workspace$/);expect(requested).toEqual([]);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'打开导航',exact:true}).click();await expect(page.getByRole('dialog').getByRole('button',{name:'单页素材库',exact:true})).toHaveCount(0);
});
test('普通用户仍可获得5页AI推荐，但没有浏览整个素材库的按钮',async({page})=>{
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user:member,setupRequired:false}}));
 let called=false;await page.route('**/api/material-recommendations',r=>{called=r.request().postDataJSON().ai;return r.fulfill({json:{items:Array.from({length:5},(_,i)=>({id:'rec-'+i,title:'推荐设计'+i,reason:'适合当前页的模块关系与文字容量',sourceName:'推荐素材',page:i+1,thumbnail:'/logo.svg'}))}});});
 await page.goto('/?output=a6238ec1-b891-4a49-9d26-300ea80a1b40&page=3');await page.getByRole('button',{name:/推荐设计/}).click();await expect(page.locator('.recommendation-card')).toHaveCount(5);expect(called).toBe(true);await expect(page.getByRole('button',{name:'从素材库挑选',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'刷新推荐',exact:true})).toBeVisible();
});
test('管理员仍可查看单页素材库',async({page})=>{
 await page.goto('/library');await expect(page.getByRole('button',{name:'单页素材库',exact:true})).toBeVisible();await expect(page.locator('.mp-preview-button').first()).toBeVisible();
});
