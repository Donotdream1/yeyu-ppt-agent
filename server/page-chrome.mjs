import {elements,first} from './ooxml.mjs';
import {absoluteNodeBounds,direct} from './components.mjs';

// Annotation edits preserve native grouping, geometry, angles, typography and copy.
export function applyPageChrome(doc,canvas,{titleY=.112,removeAuxiliaryLabels=true}={},page=0){
 const changes={page:page+1,removedLabels:[],titleMoved:false,coverExpanded:false};
 const shapes=elements(doc,'sp'),title=shapes.find(n=>first(n,'cNvPr')?.getAttribute('name')==='Text 2');
 if(removeAuxiliaryLabels)for(const node of shapes){
  if(node===title)continue;const name=first(node,'cNvPr')?.getAttribute('name')||'',box=absoluteNodeBounds(node),text=elements(first(node,'txBody')||node,'t').map(t=>t.textContent).join('');
  if(!box||!text.trim())continue;
  const auxiliary=/小李PPT|source-aux|auxiliary-label/i.test(name);
  if(auxiliary&&box.y/canvas.height>=.25&&box.y/canvas.height<.315&&box.h/canvas.height<.08&&box.x/canvas.width>.45&&(box.x+box.w)/canvas.width>.7){changes.removedLabels.push({id:first(node,'cNvPr')?.getAttribute('id'),text});node.parentNode.removeChild(node);}
 }
 if(title){const offset=direct(direct(direct(title,'spPr'),'xfrm'),'off');if(offset){offset.setAttribute('y',String(Math.round(canvas.height*titleY)));changes.titleMoved=true;}}
 return changes;
}
