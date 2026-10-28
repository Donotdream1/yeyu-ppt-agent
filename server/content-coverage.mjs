// Preserve an explicitly described feedback loop when an automatic outline
// buries it inside a benefits paragraph. Only use the source's named steps.
export function ensureVisualCoverage(plan,document,{pageCount=0}={}){
 if(pageCount||plan.slides.length>=30||plan.slides.some(s=>s.visual==='cycle'))return plan;
 const match=document.match(/[“"]([^”"\n]{4,80})[”"][^。；\n]{0,12}(?:循环|闭环)/);
 const steps=match?.[1].split(/[—→－\-]+/).map(s=>s.trim()).filter(Boolean);
 if(!steps||steps.length<3||steps.length>8)return plan;
 const paragraph=document.split(/\n+/).find(p=>p.includes(match[0]))||match[0];
 const slide={title:steps.join('、')+'的持续闭环',kind:'content',visual:'cycle',subtitle:'现场反馈与模型持续迭代',bullets:steps,notes:paragraph};
 const slides=[...plan.slides],last=slides.findLastIndex(s=>s.kind==='ending');slides.splice(last>=0?last:slides.length,0,slide);return {...plan,slides};
}
