import test from 'node:test';
import assert from 'node:assert/strict';
import {materialLibraryForbidden,grantMaterialPreviews,grantSourcePreviews} from '../server/material-library-access.mjs';
const owner={id:'owner',role:'owner'},a={id:'member-a',role:'member'},b={id:'member-b',role:'member'};
test('单页素材库列表、详情、导出与管理接口仅管理员可访问',()=>{
 for(const p of ['/library','/library/import','/material-pages','/material-pages/meta','/material-pages/p1/source','/material-pages/export','/material-pages/jobs/id','/material-audits/id/report','/material-preferences','/components','/components/id/analysis','/components/id/export']){assert.equal(materialLibraryForbidden(owner,p),false,p);assert.equal(materialLibraryForbidden(a,p),true,p);}
 for(const p of ['/material-recommendations','/generate','/replace-page-material-job','/outputs/id','/style-skills'])assert.equal(materialLibraryForbidden(a,p),false,p);
});
test('普通用户只可预览推荐给自己的素材，不能枚举其他素材',()=>{
 const item={id:'recommended',sourceId:'1234567890abcdef',page:3};assert.equal(materialLibraryForbidden(a,'/components/recommended/preview'),true);grantMaterialPreviews(a,[item]);assert.equal(materialLibraryForbidden(a,'/components/recommended/preview'),false);assert.equal(materialLibraryForbidden(b,'/components/recommended/preview'),true);assert.equal(materialLibraryForbidden(a,'/components/unrelated/preview'),true);assert.equal(materialLibraryForbidden(a,'/previews/1234567890abcdef/3.png'),false);assert.equal(materialLibraryForbidden(a,'/previews/1234567890abcdef/4.png'),true);assert.equal(materialLibraryForbidden(a,'/components/recommended/export','POST'),true);
});
test('模板预览保持可用，未授权素材页仍受限制',()=>{
 grantSourcePreviews(a,[{pages:[{thumbnail:'/api/previews/abcdef1234567890/1.png'}]}]);assert.equal(materialLibraryForbidden(a,'/previews/abcdef1234567890/1.png'),false);assert.equal(materialLibraryForbidden(a,'/previews/abcdef1234567890/2.png'),true);
});
