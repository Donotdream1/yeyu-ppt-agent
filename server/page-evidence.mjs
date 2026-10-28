// Index once per workflow. Evidence remains verbatim; scores only choose passages.
const words=text=>{
 const found=new Set();
 for(const run of String(text||'').toLowerCase().match(/[\u3400-\u9fff]+|[a-z0-9]+(?:[._%-][a-z0-9]+)*/g)||[]){
  if(/[\u3400-\u9fff]/.test(run)){for(let i=0;i<run.length-1;i++)found.add(run.slice(i,i+2));}
  else found.add(run);
 }
 return found;
};
export function preparePageEvidence(document){
 const passages=String(document||'').split(/\r?\n/).map(text=>text.trim()).filter(Boolean).flatMap(text=>text.length<=1600?[text]:(text.match(/[^。！？!?；;]+[。！？!?；;]?/g)||[text]));
 const indexed=passages.map((text,index)=>({text,index,terms:words(text)})),frequency=new Map();
 for(const passage of indexed)for(const term of passage.terms)frequency.set(term,(frequency.get(term)||0)+1);
 return (slides,maxChars=18000)=>{
  const limit=Math.max(0,Math.floor(maxChars)),selected=new Map();let total=0;
  const add=p=>{if(selected.has(p.index)||total+p.text.length+(selected.size?1:0)>limit)return;total+=p.text.length+(selected.size?1:0);selected.set(p.index,p);};
  const score=(p,terms)=>{let value=0;for(const term of terms)if(p.terms.has(term))value+=1+Math.log((indexed.length+1)/(frequency.get(term)+1));return value/Math.sqrt(Math.max(1,p.terms.size));};
  const rank=slide=>{const terms=words([slide.title,...(slide.bullets||[])].join(' '));return indexed.map(p=>({...p,score:score(p,terms)})).filter(p=>p.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);};
  const rankings=slides.map(rank);
  // Cover each assigned page before letting one verbose page consume the budget.
  for(let n=0;n<2;n++)for(const ranked of rankings){const next=ranked.find(p=>!selected.has(p.index)&&total+p.text.length+(selected.size?1:0)<=limit);if(next)add(next);}
  const rest=new Map();for(const ranked of rankings)for(const p of ranked)if(!rest.has(p.index)||rest.get(p.index).score<p.score)rest.set(p.index,p);
  for(const p of [...rest.values()].sort((a,b)=>b.score-a.score||a.index-b.index))add(p);
  // Empty retrieval is explicit: do not fill it with unrelated opening paragraphs.
  return [...selected.values()].sort((a,b)=>a.index-b.index).map(p=>p.text).join('\n');
 };
}
export function pageEvidence(document,slides,maxChars=18000){return preparePageEvidence(document)(slides,maxChars);}
