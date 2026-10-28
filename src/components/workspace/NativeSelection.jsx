import {SelectField} from '@/components/ui/select-field';
import React,{useState} from 'react';
import {MousePointer2,X,Group} from 'lucide-react';
import {Button} from '@/components/ui/button';

export default function NativeSelection({inspection,selectedIds,onSelect,enabled,onEnabled}){
 const [hint,setHint]=useState('');
 const shapes=inspection?.shapes||[],selected=shapes.filter(s=>selectedIds.includes(s.id));
 const label=s=>(s.type==='group'?'组合 · ':'')+(s.text?.replace(/\s+/g,' ').slice(0,34)||s.name||'图形')+' · #'+s.id;
 function click(e){if(!enabled||!inspection)return;const b=e.currentTarget.getBoundingClientRect(),x=(e.clientX-b.left)/b.width,y=(e.clientY-b.top)/b.height,hits=shapes.filter(s=>s.box.w>0&&s.box.h>0&&x>=s.box.x&&x<=s.box.x+s.box.w&&y>=s.box.y&&y<=s.box.y+s.box.h).sort((a,b)=>a.box.w*a.box.h-b.box.w*b.box.h),target=hits[0];if(!target){onSelect([]);setHint('此处没有可编辑对象');return;}setHint('');onSelect(e.shiftKey?(selectedIds.includes(target.id)?selectedIds.filter(id=>id!==target.id):[...selectedIds,target.id].slice(-20)):[target.id]);}
 return <>
  <div className="native-selection-toolbar">
   <Button variant={enabled?'secondary':'outline'} size="sm" aria-pressed={enabled} title="点击对象选择，按住Shift可多选；用列表选择组合或重叠对象" disabled={!inspection} onClick={()=>onEnabled(!enabled)}><MousePointer2 size={15}/>{enabled?'正在选择':'选择元素'}</Button>
   {enabled&&<SelectField aria-label="选择页面对象" value={selectedIds.length===1?selectedIds[0]:''} onChange={e=>onSelect(e.target.value?[Number(e.target.value)]:[])}><option value="">点击页面或选择对象</option>{shapes.map(s=><option key={s.id} value={s.id}>{label(s)}</option>)}</SelectField>}
   {selected.length===1&&selected[0].parentId&&<Button variant="ghost" size="sm" onClick={()=>onSelect([selected[0].parentId])}><Group size={14}/>选择整个组合</Button>}
   {!!selected.length&&<Button variant="ghost" size="sm" aria-label="清除选区" onClick={()=>onSelect([])}><X size={14}/>{selected.length} 个对象</Button>}
   {hint&&<span role="status">{hint}</span>}
  </div>
  <div className={'native-hit-layer'+(enabled?' selecting':'')} onPointerDown={click} aria-hidden="true">
   {selected.map(s=><div key={s.id} className="native-selected-object" style={{left:s.box.x*100+'%',top:s.box.y*100+'%',width:s.box.w*100+'%',height:s.box.h*100+'%'}}><span>#{s.id}</span></div>)}
  </div>
 </>;
}
