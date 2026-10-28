import {elements,first,parse,NS,textShape} from './ooxml.mjs';
import {direct} from './components.mjs';
import {applyBindingStyle} from './binding-style.mjs';
export function replaceExamplePhotos(group,{color='666666'}={}){
 let count=0;
 for(const pic of [...elements(group,'pic')]){
  const id=Number(first(pic,'cNvPr')?.getAttribute('id')),sp=direct(pic,'spPr'),xf=direct(sp,'xfrm'),off=direct(xf,'off'),ext=direct(xf,'ext');if(!id||!off||!ext)continue;
  const parsed=parse(`<root xmlns:p="${NS.p}" xmlns:a="${NS.a}">${textShape(id,'照片待补充',Number(off.getAttribute('x')),Number(off.getAttribute('y')),Number(ext.getAttribute('cx')),Number(ext.getAttribute('cy')),14,color,false)}</root>`),node=group.ownerDocument.importNode(parsed.documentElement.firstChild,true);
  const own=direct(node,'spPr');node.replaceChild(group.ownerDocument.importNode(sp,true),own);first(node,'cNvPr').setAttribute('name','照片占位框 '+id);
  const props=direct(node,'spPr');for(const fill of Array.from(props.childNodes))if(['solidFill','gradFill','blipFill','pattFill','noFill','grpFill'].includes(fill.localName))props.removeChild(fill);
  props.insertBefore(node.ownerDocument.createElementNS(NS.a,'a:noFill'),Array.from(props.childNodes).find(n=>['ln','effectLst','effectDag','scene3d','sp3d','extLst'].includes(n.localName))||null);
  applyBindingStyle(node,{align:'center',vAlign:'middle',photoPlaceholder:true});pic.parentNode.replaceChild(node,pic);count++;
 }
 return count;
}
