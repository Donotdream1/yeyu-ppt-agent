const strip=value=>String(value||'').replace(/^\s*(?:[一二三四五六七八九十]+[、.．]|\d+(?:\.\d+)?[、．\s]+|\d+\.(?!\d))\s*/,'').trim();
export function navigationPolicy(template={}){
 const widthPt=(template.width||12192000)/12700;
 return {countMode:'document',maxSections:Math.max(1,Math.min(10,Math.floor(widthPt*.56/45))),fontSizePt:20,labelChineseChars:[2,6],preserveEmptySlots:false};
}
export function navigationSections(plan){
 let declared=plan.sections;if(typeof declared==='string')declared=declared.split(/[\n；;、|,，]+/).filter(Boolean);
 if(Array.isArray(declared)&&declared.length)return declared.map(v=>strip(typeof v==='string'?v:v?.label||v?.title||v?.name));
 const agenda=plan.slides?.find(s=>s.kind==='agenda'&&s.bullets?.length);
 if(agenda)return agenda.bullets.map(v=>strip(v).split(/[：:]/)[0].trim());
 const groups=new Map();for(const s of plan.slides||[])if(!['cover','agenda','ending'].includes(s.kind)&&!groups.has(s.sectionIndex||0))groups.set(s.sectionIndex||0,strip(s.sectionTitle||s.title));
 return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([,label])=>label);
}
export function navigationIssues(plan,template){
 if(!template.bnaProfile||plan.designProfile==='research-defense'||plan.styleSkillSnapshot?.nativeTemplate)return [];
 const labels=plan.sections||[],max=navigationPolicy(template).maxSections,issues=[];
 const add=issue=>issues.push({field:'sections',issue});
 if(!labels.length||labels.length>max)add(`请根据本次文档的实际章节提供1–${max}个sections页眉关键词；这是容量上限，不是目标数量，不沿用模板示例的章节数。`);
 const seen=new Set();for(const [i,label]of labels.entries()){
  if(!label||seen.has(label))add(`第${i+1}个页眉关键词为空或重复，请概括不同章节。`);seen.add(label);
  const units=[...label].reduce((n,c)=>n+(/[\x00-\xff]/.test(c)?.55:1),0),width=(template.width||12192000)/12700*.56/Math.max(1,labels.length)-5;
  if(units>6.5||units*20>width)add(`页眉关键词「${label}」过长，请改为2–6个中文字或简短英文词组，保持20pt，不机械截断。`);
 }
 const body=(plan.slides||[]).filter(s=>!['cover','agenda','ending'].includes(s.kind)),used=new Set();
 for(const s of body){const index=s.sectionIndex??0;if(!Number.isInteger(index)||index<0||index>=labels.length)add(`页面「${s.title}」的sectionIndex须对应sections中的一个关键词。`);else used.add(index);}
 if(body.length)for(let i=0;i<labels.length;i++)if(!used.has(i))add(`页眉关键词「${labels[i]}」没有对应正文，请合并或删除空章节。`);
 const agenda=plan.slides?.find(s=>s.kind==='agenda');if(agenda&&agenda.bullets.length!==labels.length)add('目录条目数须与sections页眉关键词数一致，并按相同章节顺序组织。');
 return issues;
}
