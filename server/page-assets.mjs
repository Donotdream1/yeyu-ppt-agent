import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {dataDir} from './library.mjs';

const valid=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id);
export async function readPageAsset(id){
 if(!valid(id))throw Error('无效的照片编号');
 const folder=path.join(dataDir,'page-assets'),meta=JSON.parse(await fs.readFile(path.join(folder,id+'.json'),'utf8'));
 return {...meta,buffer:await fs.readFile(path.join(folder,id+'.png'))};
}
export async function storePageAsset(buffer,name,sessionId){
 if(!buffer?.length||buffer.length>12*1024*1024)throw Error('每张照片请控制在12MB以内');
 const image=sharp(buffer,{limitInputPixels:40000000}),meta=await image.metadata();
 if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw Error('请上传JPG、PNG或WebP静态照片');
 const result=await image.rotate().png().toBuffer({resolveWithObject:true}),id=randomUUID(),folder=path.join(dataDir,'page-assets');await fs.mkdir(folder,{recursive:true});
 const info={id,sessionId,name:String(name||'照片').slice(0,150),width:result.info.width,height:result.info.height,mime:'image/png',createdAt:new Date().toISOString(),url:`/api/page-assets/${id}`};
 await fs.writeFile(path.join(folder,id+'.png'),result.data);await fs.writeFile(path.join(folder,id+'.json'),JSON.stringify(info));return info;
}
