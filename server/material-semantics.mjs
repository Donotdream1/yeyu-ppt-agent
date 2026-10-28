// Slot semantics describe the source layout, not the example business copy.
export const materialIdentity=c=>c?.sourceId&&c?.page?`${c.sourceId}:${c.page}`:c?.id;
export function agendaItemCount(c){
 const numbers=(c?.slots||[]).filter(s=>/^0?\d{1,2}$/.test(String(s.fixed||'').trim()));
 return numbers.length||null;
}
export function duplicateMaterialPages(slides){
 const seen=new Map(),issues=[];
 for(const [i,s]of slides.entries()){
  if(s.chart||!s.materialId)continue;const key=materialIdentity(s.materialSnapshot)||s.materialId;
  if(seen.has(key))issues.push(`第 ${seen.get(key)}、${i+1} 页使用了同一页素材，请更换其中一页`);else seen.set(key,i+1);
 }
 return issues;
}
export function describeSlotSemantics(slots,component){
 const agenda=component.purpose==='agenda'||component.relation==='agenda';
 for(const s of slots){
  if(s.decorative)continue;
  if(component.purpose==='ending'){
   const t=String(s.sample).trim();
   s.semanticRole=/THANK|谢谢|感谢/i.test(t)?'closing':/\d{4}年度?/.test(t)?'report-period':/报告人|汇报人|XXXX年|XX月/.test(t)?'institution':'ending-metadata';
   s.optional=s.semanticRole==='ending-metadata';if(s.optional)s.required=false;
   continue;
  }
  if(agenda){s.semanticRole=s.fixed?'chapter-number':s.role==='body'?'chapter-summary':'chapter-title';continue;}
  if(/^(?:\d{4}年|\d{1,2}月(?:\d{1,2}日)?|\d{1,2}日)$/.test(String(s.sample).trim())){s.semanticRole='event-date';if(s.position?.w*component.width/12700>=s.font*4)s.maxChars=Math.max(s.maxChars,6);}
 }
 const labels=slots.filter(s=>!s.decorative&&s.position&&s.role==='label'&&!s.semanticRole);
 const center=s=>s.position.x+s.position.w/2;
 // A same-row pair below a heading is a parent with two children, not three peers.
 for(const s of labels){const below=labels.filter(t=>t!==s&&t.position.y-s.position.y>.065&&t.position.y-s.position.y<.18&&Math.abs(center(t)-center(s))<.24);
  const row=below.filter(t=>below.some(u=>u!==t&&Math.abs(u.position.y-t.position.y)<.025&&Math.abs(center(u)-center(t))>.08));
  if(row.length>=2){s.semanticRole='group-title';for(const t of row){t.semanticRole='item-title';t.parentSlot=s.index;}}
 }
 for(const date of slots.filter(s=>s.semanticRole==='event-date')){
  const p=date.position;if(!p)continue;
  const next=slots.filter(s=>!s.decorative&&!s.semanticRole&&s.position&&s.position.y>p.y&&s.position.y-p.y<.13&&Math.abs(center(s)-center(date))<.15).sort((a,b)=>Math.abs(center(a)-center(date))-Math.abs(center(b)-center(date)))[0];
  if(next){next.semanticRole='event-title';next.pairedSlot=date.index;date.pairedSlot=next.index;}
 }
 const dates=slots.filter(s=>s.semanticRole==='event-date'&&s.position).sort((a,b)=>a.position.x-b.position.x);
 if(component.relation==='timeline'&&dates.length>=2){const bottom=labels.filter(s=>!s.semanticRole&&s.position.y>Math.max(...dates.map(d=>d.position.y))+.12).sort((a,b)=>a.position.x-b.position.x);if(bottom.length===dates.length)for(const [i,s]of bottom.entries()){s.semanticRole='event-detail-title';s.pairedSlot=dates[i].index;}}
 return slots;
}
export function balancedLabelText(text,slot,{fontSize=slot?.font,widthPt}={}){
 const value=String(text??'');
 if(slot?.role!=='label'||!/^[\u3400-\u9fff]{4}$/.test(value)||!Number.isFinite(widthPt)||!fontSize)return value;
 return widthPt<fontSize*4.15?`${value.slice(0,2)}\n${value.slice(2)}`:value;
}
export function semanticCopyIssues(slide,c,bindings){
 const issues=[],at=i=>bindings.find(b=>b.slot===i)?.text?.trim()||'';
 if(slide.kind==='agenda'){
  const titles=(c.slots||[]).filter(s=>s.semanticRole==='chapter-title').map(s=>at(s.index)).filter(Boolean);
  if(titles.length&&new Set(titles).size!==titles.length)issues.push('目录章节标题重复');
  const titleSlots=new Set((c.slots||[]).filter(s=>s.semanticRole==='chapter-title').map(s=>s.index)),titleBindings=bindings.filter(b=>titleSlots.has(b.slot)&&b.text?.trim());
  const mapped=(slide.bullets||[]).every((_,i)=>titleBindings.filter(b=>b.contentIds?.includes('u'+(i+1))).length===1);
  if(titles.length&&(titles.length!==slide.bullets?.length||!mapped))issues.push('目录章节必须与逐页方案一一对应；每个简明章名关联一个对应条目，语义在内容审校中检查');
  if(bindings.some(b=>/^(?:本章内容|请输入.*|请填写.*|Enter your title)$/i.test(b.text?.trim()||'')))issues.push('目录保留了占位文案，须填写真实章节摘要或选择项目数匹配的素材');
 }
 for(const slot of c.slots||[]){
  if(['event-title','event-detail-title'].includes(slot.semanticRole)&&slot.pairedSlot!==undefined){const title=at(slot.index),date=at(slot.pairedSlot);if(title&&date&&(/^(?:\d{1,2}月)?\d{1,2}日/.test(title)||title===date))issues.push(`位置 ${slot.index} 是事件标题，不应再次填写日期`);}
  if(slot.semanticRole==='event-date'&&/^\d{1,2}月\d{1,2}$/.test(at(slot.index)))issues.push(`位置 ${slot.index} 的日期缺少“日”，不能为适应容量截断日期`);
  if(slot.semanticRole==='group-title'&&/^画面[一二三四五六七八九十\d]+$/.test(at(slot.index)))issues.push(`位置 ${slot.index} 是上级分组标题，应概括子项，不能作为另一幅画面编号`);
 }
 const numbered=(c.slots||[]).filter(s=>s.semanticRole==='item-title').map(s=>at(s.index)).filter(t=>/^画面[一二三四五六七八九十\d]+$/.test(t));
 if(new Set(numbered).size!==numbered.length)issues.push('子图画面编号重复，请按父标题下的真实图片逐一标注');
 return issues;
}
