import {elements,first} from './ooxml.mjs';
import {absoluteNodeBounds,nodeBounds,direct} from './components.mjs';

export const TEMPLATE_CONTRACT_VERSION=2;
export const textUnits=text=>[...String(text)].reduce((n,c)=>n+(c==='\n'?0:/[\x00-\xff]/.test(c)?.55:1),0);
const size=n=>Number(n?.getAttribute('sz'))/100||0;
export function hydratePlaceholderGeometry(node,typography){
 if(nodeBounds(node)||node.localName!=='sp')return;
 const ph=first(node,'ph');if(!ph)return;
 for(const layer of typography.layers.slice(1)){
  const match=elements(layer.doc,'sp').find(s=>{const p=first(s,'ph');return p&&(ph.hasAttribute('idx')?(p.getAttribute('idx')||'0')===ph.getAttribute('idx'):(p.getAttribute('type')||'obj')===(ph.getAttribute('type')||'obj'));});
  const transform=match&&direct(direct(match,'spPr'),'xfrm');if(!transform)continue;
  let props=direct(node,'spPr');if(!props){props=node.ownerDocument.createElementNS(node.namespaceURI,'p:spPr');node.appendChild(props);}props.insertBefore(transform.cloneNode(true),props.firstChild);return;
 }
}
export function slotContract(node,{width,height}){
 const bounds=absoluteNodeBounds(node)||nodeBounds(node),body=first(node,'txBody'),bodyPr=direct(body,'bodyPr'),cellPr=direct(node,'tcPr');
 const sizes=[...new Set(['rPr','defRPr','endParaRPr'].flatMap(k=>elements(node,k)).map(size).filter(v=>v>0))],font=Math.max(0,...sizes)||18;
 const inset=(attr,fallback)=>{const value=(node.localName==='tc'?cellPr:bodyPr)?.getAttribute(attr);return value!==null&&value!==undefined&&value!==''?Math.max(0,Number(value)/12700):fallback;};
 const margins={left:inset(node.localName==='tc'?'marL':'lIns',7.2),right:inset(node.localName==='tc'?'marR':'rIns',7.2),top:inset(node.localName==='tc'?'marT':'tIns',3.6),bottom:inset(node.localName==='tc'?'marB':'bIns',3.6)};
 const innerWidth=Math.max(font*.5,(bounds?.w||width*.2)/12700-margins.left-margins.right),innerHeight=Math.max(font,(bounds?.h||height*.1)/12700-margins.top-margins.bottom);
 const columns=Math.max(1,Number(bodyPr?.getAttribute('numCol'))||1),columnWidth=Math.max(font*.5,innerWidth/columns),lineUnits=Math.max(1,columnWidth/font*.96),lines=Math.max(1,Math.floor(innerHeight/(font*1.12)))*columns,maxUnits=Math.max(1,Math.floor(lineUnits*lines));
 return {version:TEMPLATE_CONTRACT_VERSION,bounds,fontSizePt:font,fontSizesPt:sizes,marginsPt:margins,innerWidthPt:+innerWidth.toFixed(2),innerHeightPt:+innerHeight.toFixed(2),columns,lineUnits:+lineUnits.toFixed(2),maxLines:lines,maxUnits,maxChars:Math.max(1,Math.floor(maxUnits/.55)),recommendedChineseChars:Math.max(1,Math.floor(maxUnits*.85)),confidence:bounds&&sizes.length?'geometry-estimate':'fallback-estimate',measurement:'native-geometry-estimate'};
}
export function slotTextIssues(slot,text){
 if(!slot.capacity)return text.length>(slot.maxChars??Infinity)?{key:slot.key,maxChars:slot.maxChars,actualChars:text.length,text,error:'请精简此槽文案，保持原字号'}:null;
 const c=slot.capacity,units=textUnits(text),explicitLines=text.split(/\r?\n/).length;
 if(units>c.maxUnits||explicitLines>c.maxLines)return {key:slot.key,maxChars:slot.maxChars,maxUnits:c.maxUnits,actualUnits:+units.toFixed(2),actualChars:text.length,maxLines:c.maxLines,text,error:'文字超过原生文本框的估算容量，请精简或换版；不缩小源字号'};
 return null;
}
export function nativePlanningPages(reference){return reference.pages.map(p=>({page:p.page,kind:p.kind,objects:p.objects,charts:p.charts.length,tables:p.tables,moduleCount:p.analysis?.modules?.length,logic:p.analysis?.logic,layout:p.analysis?.layoutDescription,slots:p.slots.filter(s=>!s.fixed).map(s=>({key:s.key,role:s.semanticRole||s.role,description:s.semanticDescription,modules:s.moduleNames,fontSizePt:s.fontSizePt,maxUnits:s.capacity?.maxUnits,targetChineseChars:s.capacity?.recommendedChineseChars,lines:s.capacity?.maxLines,position:s.absoluteBounds,placeholder:s.placeholder}))}));}
