import {elements,first} from './ooxml.mjs';
import {direct} from './components.mjs';

// Expand the page coordinate system while keeping circles, near-square
// freeform icons and images proportional. Text boxes and connectors use the
// additional horizontal/vertical room rather than shrinking the whole deck.
export function preserveIconAspect(group,sx,sy){
 if(!sx||!sy||Math.abs(sx/sy-1)<.01)return;
 for(const node of [...elements(group,'sp'),...elements(group,'pic')]){
  const props=direct(node,'spPr'),xfrm=direct(props,'xfrm'),off=direct(xfrm,'off'),ext=direct(xfrm,'ext');if(!off||!ext)continue;
  let rotated=Number(xfrm.getAttribute('rot')||0)!==0;for(let p=node.parentNode;p&&p!==group;p=p.parentNode)if(p.localName==='grpSp'&&Number(direct(direct(p,'grpSpPr'),'xfrm')?.getAttribute('rot')||0))rotated=true;if(rotated)continue;
  const w=+ext.getAttribute('cx'),h=+ext.getAttribute('cy'),ratio=w/Math.max(1,h),prst=first(node,'prstGeom')?.getAttribute('prst');
  const lock=node.localName==='pic'||prst==='ellipse'||Boolean(first(node,'custGeom')&&ratio>.7&&ratio<1.4&&!elements(node,'t').some(t=>t.textContent.trim()));if(!lock)continue;
  const factor=Math.min(sx,sy),nw=Math.round(w*factor/sx),nh=Math.round(h*factor/sy);
  off.setAttribute('x',String(Math.round(+off.getAttribute('x')+(w-nw)/2)));off.setAttribute('y',String(Math.round(+off.getAttribute('y')+(h-nh)/2)));ext.setAttribute('cx',String(Math.max(1,nw)));ext.setAttribute('cy',String(Math.max(1,nh)));
 }
}
