import fs from 'node:fs/promises';
import path from 'node:path';
import {dataDir} from './library.mjs';
import {renderPowerPoint} from './render.mjs';
export async function stylePreviewFiles(reference){
 const key=reference.previewKey||reference.sourceId,folder=path.join(dataDir,'previews',key),files=reference.pages.map(p=>path.join(folder,p.page+'.png'));
 const allExist=async()=>Promise.all(files.map(f=>fs.access(f).then(()=>true,()=>false))).then(a=>a.every(Boolean));
 if(!await allExist())await renderPowerPoint(path.join(dataDir,'sources',reference.sourceId+'.pptx'),folder,(reference.private?'style-':'source-')+key);
 return await Promise.all(files.map(async(file,i)=>await fs.access(file).then(()=>({page:reference.pages[i].page,file}),()=>null))).then(a=>a.filter(Boolean));
}
