import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicUpdateJson} from './atomic-json.mjs';
import {dataDir} from './library.mjs';
import {readMaterialTags} from './material-tag-store.mjs';
const filename=user=>{if(!/^[a-zA-Z0-9_-]{1,80}$/.test(user))throw Error('无效账号');return path.join(dataDir,'material-preferences',user+'.json');};
export async function materialPreferences(user){try{return JSON.parse(await fs.readFile(filename(user),'utf8'));}catch(e){if(e.code==='ENOENT')return {excluded:[]};throw e;}}
export async function personalComponents(user,items){const prefs=await materialPreferences(user);if(!prefs.excluded.length)return items;const removed=(await readMaterialTags()).pages.filter(p=>prefs.excluded.includes(p.id));return items.filter(c=>!removed.some(p=>p.sourceId===c.sourceId&&p.page===c.page));}
export async function excludeMaterialPages(user,ids,{restore=false,validIds}={}){
 if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'||!validIds.has(id)))throw Error('请选择有效素材页，每次最多500项');
 await fs.mkdir(path.dirname(filename(user)),{recursive:true});return atomicUpdateJson(filename(user),{excluded:[]},db=>{db.excluded=restore?db.excluded.filter(id=>!ids.includes(id)):[...new Set([...db.excluded,...ids])];});
}
