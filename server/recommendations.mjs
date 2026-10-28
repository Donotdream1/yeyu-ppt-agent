import {rankMaterialLayouts,classifyPurpose} from './material-layouts.mjs';

const kindForCode=code=>['S01','S02','S03'].includes(code)?'barChart':code==='S04'?'pieChart':code==='S05'?'lineChart':null;
export function nativeChartMatches(slide,c){const wanted=kindForCode(slide.chart?.code);return Boolean(wanted&&c.type==='chart'&&c.chartKinds?.length===1&&c.chartKinds[0]===wanted&&(wanted!=='barChart'||c.chartDirection==='col'));}
export function recommendMaterials(slide,components,{referenceId='',limit=10,materialScope='full',template}={}){
 limit=Math.max(1,Math.min(80,limit));
 if(slide.chart)return {items:components.filter(c=>nativeChartMatches(slide,c)).slice(0,limit).map(c=>({...c,reason:'保留本页图号和数值，替换原生图表设计',match:'chart'})),requested:limit};
 const exact=rankMaterialLayouts(slide,components,{referenceId,materialScope}),fallback=rankMaterialLayouts({...slide,visual:'text'},components,{referenceId,materialScope});
 const seen=new Set(),items=[];
 for(const [bucket,list]of [['exact',exact],['alternative',fallback]])for(const {component:c,score,tagMatch}of list){
  const family=c.familyId||c.id;if(seen.has(family))continue;seen.add(family);
  const purpose=c.purpose||classifyPurpose(c.title,c.text,c.relation);if(slide.kind!=='agenda'&&purpose==='agenda')continue;
  items.push({...c,score,match:bucket,tagMatch,reason:tagMatch?.reasons?.length?tagMatch.reasons.join(' · '):bucket==='exact'?`${c.scope==='core'?'主体组件，减少周边留白':'完整图解组合'} · ${c.slots.length} 个可填写位置`:'备选结构 · 替换时重新组织本页文案'});
  if(items.length>=limit)return {items,requested:limit};
 }
 return {items,requested:limit,note:items.length<limit?`当前素材库仅有 ${items.length} 个适合此类页面的设计，可继续导入素材。`:''};
}
