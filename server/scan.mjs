import 'dotenv/config';
import {init,scanDirectory,readLibrary} from './library.mjs';
await init();
const directory=process.argv[2]||process.env.LIBRARY_PATH;if(!directory)throw Error('请指定素材目录：npm run scan -- <素材文件夹路径>，或配置 LIBRARY_PATH');
console.log(JSON.stringify(await scanDirectory(directory),null,2));
const db=await readLibrary();
console.log(JSON.stringify({sources:db.sources,pages:db.assets.length,charts:db.assets.filter(a=>a.charts).length,tables:db.assets.filter(a=>a.tables).length,kinds:db.assets.reduce((s,a)=>(s[a.kind]=(s[a.kind]||0)+1,s),{}),sampleTitles:db.assets.slice(0,8).map(a=>a.title)},null,2));
