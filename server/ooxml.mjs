import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import path from 'node:path';
import fs from 'node:fs/promises';

export const NS = { p:'http://schemas.openxmlformats.org/presentationml/2006/main', a:'http://schemas.openxmlformats.org/drawingml/2006/main', r:'http://schemas.openxmlformats.org/officeDocument/2006/relationships', rel:'http://schemas.openxmlformats.org/package/2006/relationships' };
export const esc = s => String(s ?? '').replace(/[<>&"']/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export const elements = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
export const first = (node, name) => elements(node,name)[0];
export function parse(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('不支持含 DTD 的 XML');
  let bad = false;
  const doc = new DOMParser({errorHandler:{warning:()=>{},error:()=>{bad=true;},fatalError:()=>{bad=true;}}}).parseFromString(xml,'application/xml');
  if (bad || !doc.documentElement) throw new Error('PPTX 内部 XML 损坏');
  return doc;
}
export const serialize = doc => new XMLSerializer().serializeToString(doc);
export const relPath = part => path.posix.join(path.posix.dirname(part),'_rels',path.posix.basename(part)+'.rels');
export const resolvePart = (part,target) => target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(part), target));
export async function openZip(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files).filter(f=>!f.dir);
  if (files.length > 20000 || files.reduce((s,f)=>s+(f._data?.uncompressedSize || 0),0)>600*1024*1024) throw new Error('解压后的文档过大，请拆分后导入');
  if (files.some(f=>f.unsafeOriginalName?.split(/[\\/]/).includes('..'))) throw new Error('文件包含不安全的路径');
  return zip;
}
export async function slideOrder(zip) {
  if (!zip.file('ppt/presentation.xml')) throw new Error('请使用有效的 .pptx 文件，旧版 .ppt 需另存为 .pptx');
  const presentation = parse(await zip.file('ppt/presentation.xml').async('string'));
  const rels = parse(await zip.file('ppt/_rels/presentation.xml.rels').async('string'));
  const map = new Map(elements(rels,'Relationship').map(r=>[r.getAttribute('Id'), resolvePart('ppt/presentation.xml',r.getAttribute('Target'))]));
  const size=first(presentation,'sldSz');
  const list=Array.from(presentation.documentElement.childNodes).find(n=>n.localName==='sldIdLst');
  return {paths:Array.from(list?.childNodes||[]).filter(n=>n.localName==='sldId').map(n=>map.get(n.getAttributeNS(NS.r,'id')||n.getAttribute('r:id'))), width:Number(size?.getAttribute('cx')||12192000),height:Number(size?.getAttribute('cy')||6858000)};
}
export function slideInfo(xml) {
  const doc=parse(xml);
  const shapes=elements(doc,'sp').map(sp=>{
    const tx=first(sp,'txBody'); if(!tx)return null;
    const texts=elements(tx,'t').map(t=>t.textContent).join('');
    const xfrm=first(sp,'xfrm'), off=xfrm && first(xfrm,'off'), ext=xfrm && first(xfrm,'ext');
    const props=elements(tx,'rPr');
    return {text:texts,x:Number(off?.getAttribute('x')||0),y:Number(off?.getAttribute('y')||0),w:Number(ext?.getAttribute('cx')||0),h:Number(ext?.getAttribute('cy')||0),font:Math.max(12,...props.map(n=>Number(n.getAttribute('sz')||1200)/100))};
  }).filter(Boolean);
  const text=shapes.map(s=>s.text).join('\n');
  let kind='content';
  const header=shapes.find(s=>s.y<1200000&&s.x<6000000&&s.w>2500000&&s.text.length>3)?.text||'';
  if (/THANK YOU|感谢聆听|谢谢观看|敬请指教/i.test(text))kind='ending';
  else if (/目录|CONTENTS|AGENDA/i.test(text))kind='agenda';
  else if (/YOUR LOGO/.test(text)&&/WORK REPORT|年度|汇报/.test(text)&&shapes.filter(s=>s.text.trim()).length<12)kind='cover';
  else if (/流程|步骤|阶段|计划|时间轴|路线/.test(header))kind='process';
  return {text,shapes,kind,charts:elements(doc,'chart').length,tables:elements(doc,'tbl').length,images:elements(doc,'blip').length,editableShapes:elements(doc,'sp').length+elements(doc,'cxnSp').length,placeholders:[...new Set(text.match(/\{\{[^}]+\}\}/g)||[])]};
}
export function setShapeText(doc, shape, value) {
  const tx=first(shape,'txBody');if(!tx)return;
  let ps=elements(tx,'p');if(!ps.length)return;
  const prototype=ps[0].cloneNode(true);
  for(const p of ps)p.parentNode.removeChild(p);
  for (const line of String(value).split('\n')) {
    const p=prototype.cloneNode(true);
    const r=first(p,'r')?.cloneNode(true)||doc.createElementNS(NS.a,'a:r');
    for(const n of Array.from(p.childNodes))if(n.localName!=='pPr')p.removeChild(n);
    for(const n of Array.from(r.childNodes))if(n.localName!=='rPr')r.removeChild(n);
    const t=doc.createElementNS(NS.a,'a:t'); t.appendChild(doc.createTextNode(line));r.appendChild(t);p.appendChild(r);tx.appendChild(p);
  }
  const bodyPr=first(tx,'bodyPr');if(bodyPr){for(const key of ['noAutofit','spAutoFit'])for(const n of elements(bodyPr,key))n.parentNode.removeChild(n);if(!first(bodyPr,'normAutofit'))bodyPr.appendChild(doc.createElementNS(NS.a,'a:normAutofit'));}
  // Calculate a conservative size: PowerPoint's normAutofit alone does not recompute cached text metrics on every import.
  const ext=first(shape,'ext'),width=Number(ext?.getAttribute('cx')||0)/12700,height=Number(ext?.getAttribute('cy')||0)/12700;
  const props=elements(tx,'rPr'),original=Math.max(12,...['rPr','defRPr','endParaRPr'].flatMap(key=>elements(tx,key)).map(n=>Number(n.getAttribute('sz')||0)/100));
  const lengths=String(value).split('\n').map(s=>[...s].reduce((n,c)=>n+(/[\u2e80-\u9fff]/.test(c)?1:.55),0));
  let size=original;
  if(String(value).length&&width>0&&height>0){while(size>12&&lengths.reduce((n,l)=>n+Math.max(1,Math.ceil(l*size/(width*.94))),0)*size*1.2>height)size--;if(size<original)for(const p of props)p.setAttribute('sz',String(Math.round(size*100)));}
}
export function fillSlide(xml, slide, page, mapping) {
  const doc=parse(xml), warnings=[];
  const shapes=elements(doc,'sp').filter(sp=>first(sp,'txBody'));
  const body=slide.bullets.join('\n');
  const slots={title:slide.title,subtitle:slide.subtitle||'',body,page:String(page)};
  slide.bullets.forEach((b,i)=>{slots['point'+(i+1)]=b;});
  const tagged=shapes.some(s=>/\{\{/.test(elements(first(s,'txBody'),'t').map(t=>t.textContent).join('')));
  if(mapping){
    if(mapping.clearOtherText)for(const sp of shapes)setShapeText(doc,sp,'');
    if(!shapes[mapping.titleIndex])throw new Error('标注的标题槽不存在，请重新标注该素材');
    setShapeText(doc,shapes[mapping.titleIndex],slide.title);
    if(mapping.subtitleIndex>=0&&shapes[mapping.subtitleIndex])setShapeText(doc,shapes[mapping.subtitleIndex],slide.subtitle||'');
    mapping.bodyIndices.forEach((index,i)=>{if(shapes[index])setShapeText(doc,shapes[index],i===mapping.bodyIndices.length-1?slide.bullets.slice(i).join('\n'):(slide.bullets[i]||''));});
    if(!mapping.bodyIndices.length&&slide.bullets.length)warnings.push('该版式未标注正文槽，正文已保存在备注中');
  }else if(tagged){
    for(const sp of shapes){const old=elements(first(sp,'txBody'),'t').map(t=>t.textContent).join('');if(/\{\{/.test(old))setShapeText(doc,sp,old.replace(/\{\{\s*([^} ]+)\s*\}\}/g,(_,key)=>{if(!(key in slots))warnings.push('未知占位符：'+key);return slots[key]??'';}));}
  }else{
    const candidates=shapes.map(sp=>({sp,text:elements(first(sp,'txBody'),'t').map(t=>t.textContent).join(''),font:Math.max(12,...elements(sp,'rPr').map(r=>Number(r.getAttribute('sz')||1200)/100)),x:Number(first(sp,'off')?.getAttribute('x')||0),y:Number(first(sp,'off')?.getAttribute('y')||0),w:Number(first(sp,'ext')?.getAttribute('cx')||0),h:Number(first(sp,'ext')?.getAttribute('cy')||0)})).filter(x=>x.text.trim());
    const cover=['cover','ending'].includes(slide.kind);
    const ranked=[...candidates].sort((a,b)=>b.font-a.font||b.w-a.w);
    const titleSlot=cover?ranked.find(x=>x.w>3000000):candidates.find(x=>x.y<1200000&&x.x<6000000&&x.w>2500000&&x.text.length>3)||ranked[0];
    const rest=candidates.filter(x=>x!==titleSlot&&x.y>1200000&&x.w>2000000&&x.h>600000&&x.font<=24&&x.text.length>=20).sort((a,b)=>Math.abs(a.y-b.y)<150000?a.x-b.x:a.y-b.y);
    for(const x of candidates){if(x===titleSlot)continue;if(!/^0?[1-8]$/.test(x.text.trim()))setShapeText(doc,x.sp,'');}
    if(titleSlot)setShapeText(doc,titleSlot.sp,slide.title);
    const lines=cover?[slide.subtitle||slide.bullets.join('，')].filter(Boolean):slide.bullets;
    const bound=new Set([titleSlot,...rest]);
    rest.forEach((x,i)=>{
      const line=i===rest.length-1?lines.slice(i).join('\n'):(lines[i]||'');setShapeText(doc,x.sp,line);
      if(!cover&&line){const heading=candidates.filter(c=>!bound.has(c)&&c.text.length<=18&&c.w>500000&&Math.abs(c.x-x.x)<700000&&c.y<=x.y&&x.y-c.y<1100000).sort((a,b)=>b.y-a.y)[0];if(heading){const label=line.split(/[：:，,。]/)[0];setShapeText(doc,heading.sp,label.slice(0,10));bound.add(heading);}}
    });
    if(!cover){const summary=candidates.find(c=>!bound.has(c)&&c.y>1200000&&c.y<2200000&&c.w>3500000&&c.h<=600000&&c.text.length>=20);if(summary)setShapeText(doc,summary.sp,slide.subtitle||slide.title);}
    if(!rest.length && lines.length)warnings.push('该素材缺少正文文本槽，正文已放入备注，请在 PowerPoint 中调整');
    warnings.push('自动映射文本槽，请在 PowerPoint 中检查排版');
  }
  if(first(doc,'chart')||first(doc,'tbl'))warnings.push('素材中的图表或表格保留原始数据，请核对后使用');
  return {xml:serialize(doc),warnings};
}

const decl='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const relationships=rows=>decl+`<Relationships xmlns="${NS.rel}">${rows.map(([id,type,target])=>`<Relationship Id="${id}" Type="${NS.r}/${type}" Target="${esc(target)}"/>`).join('')}</Relationships>`;
export const canvas={width:12192000,height:6858000};
export function textShape(id,text,x,y,w,h,size,color='173A33',bold=false){
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${String(text).split('\n').map(line=>`<a:p><a:pPr><a:lnSpc><a:spcPct val="115000"/></a:lnSpc><a:spcAft><a:spcPts val="1400"/></a:spcAft></a:pPr><a:r><a:rPr lang="zh-CN" sz="${Math.round(size*100)}" b="${bold?1:0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/></a:rPr><a:t>${esc(line)}</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p>`).join('')}</p:txBody></p:sp>`;
}
export function builtinSlide(slide,page,style='forest') {
  const dark=slide.kind==='cover'||slide.kind==='ending';
  const color=style==='ink'?'243C5A':style==='warm'?'9A5739':'234C40';
  let shapes=textShape(2,String(page).padStart(2,'0'),700000,500000,1200000,500000,16,dark?'C2D5C9':color);
  shapes+=textShape(3,slide.title,700000,dark?1900000:1100000,10800000,dark?1900000:1200000,dark?42:32,dark?'FFFFFF':'173A33',true);
  if(dark){shapes+=textShape(4,slide.subtitle||slide.bullets.join(' · '),750000,4300000,10000000,1300000,20,'DBE5DD');}
  else {shapes+=textShape(4,slide.subtitle||'',750000,2350000,10400000,500000,17,'6B7C75');shapes+=textShape(5,slide.bullets.map((b,i)=>`${String(i+1).padStart(2,'0')}    ${b}`).join('\n'),750000,3100000,10500000,3000000,22,'28443B');}
  return decl+`<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${dark?color:'F5F5EE'}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}
export async function createDeck(slides, assets, loadSource, style='forest') {
  const zip=await openZip(await fs.readFile(new URL('./base.pptx',import.meta.url))),types=new Map(),presRels=[],ids=[],masters=[],notes=[],warnings=[];
  const baseTypes=parse(await zip.file('[Content_Types].xml').async('string'));
  for(const n of elements(baseTypes,'Override'))types.set(n.getAttribute('PartName'),n.getAttribute('ContentType'));
  const baseMaster=parse(await zip.file('ppt/slideMasters/slideMaster1.xml').async('string'));
  let nextMasterId=Math.max(2147483648,...elements(baseMaster,'sldLayoutId').map(n=>Number(n.getAttribute('id'))))+1;
  const content=(part,type)=>types.set('/'+part,type);
  const put=(part,xml,type)=>{if(/^ppt\/(slideLayouts|slideMasters|theme|notesMasters)\//.test(part)&&zip.file(part))return;zip.file(part,xml);if(type)content(part,type);};
  put('ppt/slideLayouts/slideLayout1.xml',decl+`<p:sldLayout xmlns:p="${NS.p}" xmlns:a="${NS.a}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml');
  put('ppt/slideLayouts/_rels/slideLayout1.xml.rels',relationships([['rId1','slideMaster','../slideMasters/slideMaster1.xml']]));
  put('ppt/slideMasters/slideMaster1.xml',decl+`<p:sldMaster xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml');
  put('ppt/slideMasters/_rels/slideMaster1.xml.rels',relationships([['rId1','slideLayout','../slideLayouts/slideLayout1.xml'],['rId2','theme','../theme/theme1.xml']]));
  put('ppt/theme/theme1.xml',decl+`<a:theme xmlns:a="${NS.a}" name="拾页"><a:themeElements><a:clrScheme name="Forest">${Object.entries({dk1:'173A33',lt1:'FFFFFF',dk2:'234C40',lt2:'F5F5EE',accent1:'234C40',accent2:'A2BAA4',accent3:'C29468',accent4:'687F98',accent5:'9B6B73',accent6:'D6C6A4',hlink:'0563C1',folHlink:'954F72'}).map(([k,v])=>`<a:${k}><a:srgbClr val="${v}"/></a:${k}>`).join('')}</a:clrScheme><a:fontScheme name="YaHei"><a:majorFont><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Default"><a:fillStyleLst>${'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${[9525,25400,38100].map(w=>`<a:ln w="${w}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>`).join('')}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`,'application/vnd.openxmlformats-officedocument.theme+xml');
  presRels.push(['rId1','slideMaster','slideMasters/slideMaster1.xml']);masters.push(['2147483648','rId1']);
  const imported=new Map();const defaults=new Map([['rels','application/vnd.openxmlformats-package.relationships+xml'],['xml','application/xml']]);
  for(const n of elements(baseTypes,'Default'))defaults.set(n.getAttribute('Extension'),n.getAttribute('ContentType'));
  for(let i=0;i<slides.length;i++) {
    const slide=slides[i], asset=assets.find(a=>a.id===slide.assetId);let part=`ppt/slides/slide${i+1}.xml`,xml;
    if(asset && !asset.builtin){
      let source=imported.get(asset.sourceId);
      if(!source){
        const src=await openZip(await loadSource(asset.sourceId));const prefix=`imports/${asset.sourceId}/`;
        const ct=parse(await src.file('[Content_Types].xml').async('string'));
        for(const n of elements(ct,'Default'))defaults.set(n.getAttribute('Extension'),n.getAttribute('ContentType'));
        const sourceTypes=new Map(elements(ct,'Override').map(n=>[n.getAttribute('PartName').slice(1),n.getAttribute('ContentType')]));
        const copied=new Set();
        async function copyPart(name){
          if(copied.has(name))return;copied.add(name);
          const file=src.file(name);if(!file)throw new Error('素材缺少依赖：'+name);
          const type=sourceTypes.get(name);if(type)content(prefix+name,type);
          if(type?.endsWith('slideMaster+xml')){const rid='rId'+(presRels.length+1);presRels.push([rid,'slideMaster','../'+prefix+name]);masters.push([String(nextMasterId++),rid]);const d=parse(await file.async('string'));for(const n of elements(d,'sldLayoutId'))n.setAttribute('id',String(nextMasterId++));zip.file(prefix+name,serialize(d));}
          else zip.file(prefix+name,await file.async('nodebuffer'));
          const relFile=src.file(relPath(name));
          if(relFile){
            const d=parse(await relFile.async('string'));
            for(const n of elements(d,'Relationship')){
              if(/\/(notesSlide|comments|commentAuthors)$/.test(n.getAttribute('Type'))){n.parentNode.removeChild(n);continue;}
              if(n.getAttribute('TargetMode')==='External')continue;
              const target=n.getAttribute('Target');await copyPart(resolvePart(name,target));
              if(target.startsWith('/'))n.setAttribute('Target','/'+prefix+target.slice(1));
            }
            put(relPath(prefix+name),serialize(d));
          }
        }
        source={src,prefix,copyPart};imported.set(asset.sourceId,source);
      }
      await source.copyPart(asset.part);
      const original=await source.src.file(asset.part).async('string');const result=fillSlide(original,slide,i+1,asset.mapping);xml=result.xml;
      result.warnings.forEach(w=>warnings.push(`第 ${i+1} 页：${w}`));
      // Clone beside the original slide, keeping relative image/chart/layout links intact.
      part=source.prefix+path.posix.join(path.posix.dirname(asset.part),`generated-${i+1}.xml`);
      const rel=source.src.file(relPath(asset.part));
      if(rel){const d=parse(await rel.async('string'));for(const n of elements(d,'Relationship')){if(/\/(notesSlide|comments|commentAuthors)$/.test(n.getAttribute('Type')))n.parentNode.removeChild(n);else if(n.getAttribute('Target').startsWith('/')&&n.getAttribute('TargetMode')!=='External')n.setAttribute('Target','/'+source.prefix+n.getAttribute('Target').slice(1));}put(relPath(part),serialize(d));}
    }else{xml=builtinSlide(slide,i+1,style);put(relPath(part),relationships([['rId1','slideLayout','../slideLayouts/slideLayout1.xml']]));}
    put(part,xml,'application/vnd.openxmlformats-officedocument.presentationml.slide+xml');
    // Always include the complete source text in slide notes, including text that cannot fit in template slots.
    notes.push({part,slide,index:i+1});
    const rid='rId'+(presRels.length+1);presRels.push([rid,'slide',path.posix.relative('ppt',part)]);ids.push([String(256+i),rid]);
  }
  put('ppt/notesMasters/notesMaster1.xml',decl+`<p:notesMaster xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:notesStyle/></p:notesMaster>`,'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml');
  put('ppt/notesMasters/_rels/notesMaster1.xml.rels',relationships([['rId1','theme','../theme/theme1.xml']]));
  const noteMasterRid='rId'+(presRels.length+1);presRels.push([noteMasterRid,'notesMaster','notesMasters/notesMaster1.xml']);
  for(const n of notes){const np=`ppt/notesSlides/notesSlide${n.index}.xml`;put(np,decl+`<p:notes xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${textShape(2,[n.slide.title,n.slide.subtitle,...n.slide.bullets,n.slide.notes||''].filter(Boolean).join('\n'),0,0,6000000,6000000,14)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`,'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml');put(relPath(np),relationships([['rId1','notesMaster','../notesMasters/notesMaster1.xml'],['rId2','slide',path.posix.relative(path.posix.dirname(np),n.part)]]));const rp=relPath(n.part);const d=parse(await zip.file(rp).async('string'));const nr=d.createElementNS(NS.rel,'Relationship');nr.setAttribute('Id','rIdGeneratedNotes');nr.setAttribute('Type',NS.r+'/notesSlide');nr.setAttribute('Target',path.posix.relative(path.posix.dirname(n.part),np));d.documentElement.appendChild(nr);put(rp,serialize(d));}
  put('ppt/presentation.xml',decl+`<p:presentation xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:sldMasterIdLst>${masters.map(([id,rid])=>`<p:sldMasterId id="${id}" r:id="${rid}"/>`).join('')}</p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="${noteMasterRid}"/></p:notesMasterIdLst><p:sldIdLst>${ids.map(([id,rid])=>`<p:sldId id="${id}" r:id="${rid}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${canvas.width}" cy="${canvas.height}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml');
  put('ppt/_rels/presentation.xml.rels',relationships(presRels));
  put('_rels/.rels',relationships([['rId1','officeDocument','ppt/presentation.xml']]));
  put('[Content_Types].xml',decl+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${[...defaults].map(([e,t])=>`<Default Extension="${esc(e)}" ContentType="${esc(t)}"/>`).join('')}${[...types].map(([p,t])=>`<Override PartName="${esc(p)}" ContentType="${esc(t)}"/>`).join('')}</Types>`);
  return {buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),warnings:[...new Set(warnings)]};
}
