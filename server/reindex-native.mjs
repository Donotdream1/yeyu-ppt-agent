import {init,readLibrary} from './library.mjs';
import {indexComponents,readComponents} from './components.mjs';
await init();const db=await readLibrary();for(const source of db.sources.filter(s=>s.role!=='template'))console.log(JSON.stringify(await indexComponents(source.id)));
const c=await readComponents();console.log(JSON.stringify({nativeComponents:c.items.length,types:c.items.reduce((s,c)=>(s[c.type]=(s[c.type]||0)+1,s),{}),nested:c.items.filter(c=>c.nodePaths).length,charts:c.items.filter(c=>c.type==='chart').slice(0,4).map(c=>({id:c.id,kind:c.chartKinds,direction:c.chartDirection}))}));
