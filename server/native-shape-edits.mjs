import {parse,first,elements,NS,textShape} from './ooxml.mjs';
import {nodeBounds,nodeParentMatrix,direct,absoluteNodeBounds} from './components.mjs';
import {primitiveShape} from './native-primitives.mjs';

export function placeNativeNode(node,box,canvas,rotation){
 const old=nodeBounds(node),props=direct(node,node.localName==='grpSp'?'grpSpPr':'spPr'),xf=direct(props,'xfrm')||direct(node,'xfrm');if(!old||!xf)throw Error('对象没有可修改的位置');
 if(rotation!==undefined)xf.setAttribute('rot',String(Math.round(rotation*60000)));
 const m=nodeParentMatrix(node),det=m[0]*m[3]-m[1]*m[2];if(Math.abs(det)<1e-10)throw Error('组合变换无法安全调整');
 if(node.localName==='cxnSp'||old.w===0||old.h===0){const inverse=(x,y)=>({x:(m[3]*(x-m[4])-m[2]*(y-m[5]))/det,y:(-m[1]*(x-m[4])+m[0]*(y-m[5]))/det}),p=inverse(box.x*canvas.width,box.y*canvas.height),q=inverse((box.x+box.w)*canvas.width,(box.y+box.h)*canvas.height),off=direct(xf,'off'),ext=direct(xf,'ext');xf.setAttribute('rot','0');xf.setAttribute('flipH',q.x<p.x?'1':'0');xf.setAttribute('flipV',q.y<p.y?'1':'0');off.setAttribute('x',String(Math.round(Math.min(p.x,q.x))));off.setAttribute('y',String(Math.round(Math.min(p.y,q.y))));ext.setAttribute('cx',String(Math.round(Math.abs(q.x-p.x))));ext.setAttribute('cy',String(Math.round(Math.abs(q.y-p.y))));for(const key of ['stCxn','endCxn'])for(const n of [...elements(node,key)])n.parentNode.removeChild(n);return;}
 const angle=(+xf.getAttribute('rot')||0)/60000*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),a=Math.abs(m[0]*c+m[2]*s),b=Math.abs(-m[0]*s+m[2]*c),d=Math.abs(m[1]*c+m[3]*s),e=Math.abs(-m[1]*s+m[3]*c),w=box.w*canvas.width,h=box.h*canvas.height,D=a*e-b*d;
 let nw=D?(w*e-b*h)/D:0,nh=D?(a*h-w*d)/D:0;
 if(nw<=0||nh<=0||['pic','grpSp'].includes(node.localName)){const current=absoluteNodeBounds(node),scale=Math.min(w/current.w,h/current.h);nw=old.w*scale;nh=old.h*scale;}
 const cx=(box.x+box.w/2)*canvas.width-m[4],cy=(box.y+box.h/2)*canvas.height-m[5],lx=(m[3]*cx-m[2]*cy)/det,ly=(-m[1]*cx+m[0]*cy)/det,off=direct(xf,'off'),ext=direct(xf,'ext');
 off.setAttribute('x',String(Math.round(lx-nw/2)));off.setAttribute('y',String(Math.round(ly-nh/2)));ext.setAttribute('cx',String(Math.round(nw)));ext.setAttribute('cy',String(Math.round(nh)));
}
export function styleNativeShape(node,op){
 const doc=node.ownerDocument,props=direct(node,'spPr')||direct(node,'grpSpPr');if(!props||node.localName==='grpSp')throw Error('请调整具体图形的样式，组合可整体移动或缩放');
 const setFill=(parent,color)=>{for(const n of Array.from(parent.childNodes))if(['solidFill','noFill','gradFill','pattFill','blipFill'].includes(n.localName))parent.removeChild(n);const fill=doc.createElementNS(NS.a,color==='none'?'a:noFill':'a:solidFill');if(color!=='none'){const rgb=doc.createElementNS(NS.a,'a:srgbClr');rgb.setAttribute('val',color);fill.appendChild(rgb);}parent.insertBefore(fill,Array.from(parent.childNodes).find(n=>['ln','effectLst','effectDag','scene3d','sp3d','extLst','prstDash','custDash','round','bevel','miter','headEnd','tailEnd'].includes(n.localName))||null);};
 if(op.fill!==undefined)setFill(props,op.fill);if(op.stroke!==undefined||op.strokeWidth!==undefined){let line=direct(props,'ln');if(!line){line=doc.createElementNS(NS.a,'a:ln');props.appendChild(line);}if(op.stroke!==undefined)setFill(line,op.stroke);if(op.strokeWidth!==undefined)line.setAttribute('w',String(Math.round(op.strokeWidth*12700)));}
 if(op.geometry){for(const n of [...elements(props,'prstGeom'),...elements(props,'custGeom')])n.parentNode.removeChild(n);const geom=doc.importNode(parse(`<a:prstGeom xmlns:a="${NS.a}" prst="${op.geometry}"><a:avLst/></a:prstGeom>`).documentElement,true),xf=direct(props,'xfrm');props.insertBefore(geom,xf?.nextSibling||props.firstChild);}
}
export function cloneNativeNode(node,nextId){
 if(elements(node,'chart').length)throw Error('统计图表请通过图表技能重组，不能直接复制其数据关系');const copy=node.cloneNode(true),ids=new Map();for(const prop of elements(copy,'cNvPr')){const old=prop.getAttribute('id'),id=String(nextId++);ids.set(old,id);prop.setAttribute('id',id);prop.setAttribute('name','PageCopy:'+prop.getAttribute('name'));}
 for(const key of ['stCxn','endCxn'])for(const n of elements(copy,key))if(ids.has(n.getAttribute('id')))n.setAttribute('id',ids.get(n.getAttribute('id')));
 for(const n of [...elements(copy,'custDataLst')])n.parentNode.removeChild(n);node.parentNode.appendChild(copy);return copy;
}
export function addNativeShape(doc,id,op,canvas){
 const node=primitiveShape(doc,id,{id:'PageShape:'+op.operationId,shapeKind:op.geometry||'roundRect',...op.box,fill:op.fill==='none'?undefined:op.fill||'FFFFFF',stroke:op.stroke==='none'?undefined:op.stroke||'202020',strokeWidth:op.strokeWidth??.75},canvas);styleNativeShape(node,{geometry:op.geometry||'roundRect',...(op.fill==='none'?{fill:'none'}:{}),...(op.strokeWidth!==undefined?{strokeWidth:op.strokeWidth}:{})});
 if(op.text){const text=parse(`<root xmlns:p="${NS.p}" xmlns:a="${NS.a}">${textShape(id,op.text,0,0,1000000,1000000,op.fontSize||16,op.textColor||'202020',false)}</root>`).documentElement.firstChild;node.appendChild(doc.importNode(first(text,'txBody'),true));}
 first(doc,'spTree').appendChild(node);return node;
}
