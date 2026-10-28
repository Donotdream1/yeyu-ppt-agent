import {openZip,slideOrder,parse,elements,first} from './ooxml.mjs';
import {readLibrary,sourceBuffer} from './library.mjs';
import {readSourceTheme} from './source-theme.mjs';

const valid=s=>/^[0-9a-f]{6}$/i.test(s||'');
const rgb=s=>s.match(/../g).map(v=>parseInt(v,16));
const light=s=>rgb(s).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)/255;
const saturated=s=>Math.max(...rgb(s))-Math.min(...rgb(s))>45;
const cache=new Map();
export async function extractMaterialPalette(sourceId){
 if(cache.has(sourceId))return structuredClone(cache.get(sourceId));
 const library=await readLibrary(),source=library.sources.find(s=>s.id===sourceId);if(!source)throw Error('配色素材源不存在');
 const zip=await openZip(await sourceBuffer(sourceId)),order=await slideOrder(zip),theme=await readSourceTheme(zip,order.paths[0]),colors=theme?.colors||{},counts=new Map(),evidence=[];
 const accents=[...new Set(['accent1','accent2','accent3','accent4','accent5','accent6'].map(k=>colors[k]).filter(valid).map(s=>s.toUpperCase()))];
 for(const part of order.paths.slice(0,18)){const doc=parse(await zip.file(part).async('string'));for(const n of elements(doc,'srgbClr')){const v=n.getAttribute('val')?.toUpperCase();if(valid(v)){counts.set(v,(counts.get(v)||0)+1);if(evidence.length<100)evidence.push({color:v,part});}}}
 const ranked=[...counts].sort((a,b)=>b[1]-a[1]).map(v=>v[0]);
 const primary=accents.find(s=>{const [r,g,b]=rgb(s);return b>r*1.15&&b>=g&&light(s)<.7;})||accents.find(s=>saturated(s)&&light(s)<.7)||ranked.find(s=>saturated(s)&&light(s)<.7)||colors.dk1||'202020';
 const secondary=accents.find(s=>s!==primary)||primary,accent=accents.find(s=>{const [r,g,b]=rgb(s);return r>g*1.2&&r>b*1.2;})||secondary;
 const surface=accents.find(s=>light(s)>.74&&light(s)<.97&&saturated(s))||ranked.find(s=>light(s)>.86&&light(s)<.995),border=accents.find(s=>!saturated(s)&&light(s)>.4&&light(s)<.85)||ranked.find(s=>!saturated(s)&&light(s)>.4&&light(s)<.85);
 const result={mode:'material',sourceId,sourceName:source.name,primary,bar:primary,secondary,accent,text:valid(colors.dk1)?colors.dk1.toUpperCase():'202020',background:'FFFFFF',surface:surface||'FFFFFF',border:border||'B8C0C6',colors:accents.length?accents:ranked.slice(0,6),provenance:{kind:'source-pptx-theme-and-explicit-colors',parts:order.paths.slice(0,18),evidence:evidence.filter(e=>[primary,secondary,accent,surface,border].includes(e.color))}};
 cache.set(sourceId,result);return structuredClone(result);
}
export async function resolvePalette({mode='material',sourceId,userColors={}}={},template){
 if(mode==='user'){
  if(!valid(userColors.primary))throw Error('用户配色至少需要有效的主色');
  const normalized={};for(const [k,v]of Object.entries(userColors))if(valid(v))normalized[k]=v.toUpperCase();
  return {mode:'user',...normalized,bar:normalized.bar||normalized.primary,secondary:normalized.secondary||normalized.primary,accent:normalized.accent||normalized.primary,text:normalized.text||'202020',background:'FFFFFF',surface:normalized.surface||'FFFFFF',border:normalized.border||'B8C0C6',colors:[...new Set(Object.values(normalized))],provenance:{kind:'explicit-user-colors'}};
 }
 if(mode==='template')return {mode:'template',...template.theme,bar:template.theme.primary,accent:template.theme.secondary||template.theme.primary,surface:'FFFFFF',colors:[template.theme.primary,template.theme.secondary].filter(valid),provenance:{kind:'explicit-user-template'}};
 const library=await readLibrary(),id=sourceId||library.sources.find(s=>s.name.includes('商务蓝橙'))?.id||library.sources.find(s=>s.role!=='template')?.id;
 if(!id)throw Error('请先导入素材库或明确指定配色');return extractMaterialPalette(id);
}
