import {navigationSections} from './navigation-sections.mjs';
export function coverFields(plan){
 const declared=plan.cover||{},raw=declared.title||plan.coverTitle||plan.title||'',prefix=raw.match(/^(.{1,35}?(?:团委|党委|委员会|公司|学院|中心|部门))(?=\d{4}年)/);
 const unit=declared.unit||prefix?.[1]||plan.institutionName||'汇报单位：待补充',presenter=declared.presenter||'XXX',reportDate=declared.reportDate||'待补充';
 return {title:prefix?raw.slice(prefix[1].length):raw,unit:unit==='汇报单位：待补充'?unit:unit.replace(/^\s*汇报单位\s*[:：]\s*/,''),presenter:presenter.replace(/^\s*(?:汇报人|报告人|主讲人)\s*[:：]\s*/,''),reportDate:reportDate.replace(/^\s*(?:汇报时间|报告时间|日期)\s*[:：]\s*/,'')};
}
export function normalizePresentationOutline(plan){
 if(!Array.isArray(plan?.slides))return plan;
 const counts=new Map(),cover=coverFields(plan);
 return {...plan,cover,sections:navigationSections(plan),slides:plan.slides.map(slide=>{
  if(!slide||typeof slide!=='object'||Array.isArray(slide))return slide;
  if(slide.kind==='cover')return {...slide,title:cover.title,subtitle:cover.unit};
  if(slide.kind==='agenda')return {...slide,title:'目录',bullets:Array.isArray(slide.bullets)?slide.bullets.map(t=>typeof t==='string'?t.replace(/^\s*(?:[一二三四五六七八九十]+[、.．]|\d{1,2}(?:\.\d{1,2})?\s+|\d{1,2}(?:\.\d{1,2})?[、．]|\d{1,2}\.(?!\d))\s*/,''):t):slide.bullets};
  if(slide.kind==='ending')return {...slide,title:/^(?:谢谢|感谢|请批评)/.test(slide.title)?slide.title:'谢谢观看'};
  const section=(slide.sectionIndex||0)+1,n=(counts.get(section)||0)+1;counts.set(section,n);
  if(typeof slide.title!=='string')return slide;
  const title=slide.title.replace(/^\s*(?:[一二三四五六七八九十]+[、.．]|\d+\.\d+[、.．\s]+)\s*/,'');
  return {...slide,title:`${section}.${n} ${title}`};
 })};
}
