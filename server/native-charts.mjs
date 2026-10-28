import {designSystem} from './design-system.mjs';
import JSZip from 'jszip';
import path from 'node:path';
import {parse,serialize,elements,first,esc,NS,relPath,resolvePart} from './ooxml.mjs';
const C='http://schemas.openxmlformats.org/drawingml/2006/chart';
const E='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const child=(n,name)=>Array.from(n.childNodes||[]).find(c=>c.localName===name);
const column=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
export async function chartWorkbook(data){
  const zip=new JSZip(),categories=[...new Set(data.records.map(r=>r.x))],series=[...new Set(data.records.map(r=>r.series))];
  const inline=(ref,text)=>`<c r="${ref}" t="inlineStr"><is><t>${esc(text)}</t></is></c>`;
  const rows=[`<row r="1">${inline('A1','类别')}${series.map((s,i)=>inline(column(i+1)+'1',s)).join('')}</row>`,...categories.map((x,i)=>`<row r="${i+2}">${inline('A'+(i+2),x)}${series.map((s,j)=>{const r=data.records.find(r=>r.x===x&&r.series===s);return r&&r.value!==null?`<c r="${column(j+1)}${i+2}"><v>${r.value}</v></c>`:'';}).join('')}</row>`)];
  zip.file('[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  zip.file('_rels/.rels',`<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${NS.r}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml',`<workbook xmlns="${E}" xmlns:r="${NS.r}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels',`<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${NS.r}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file('xl/worksheets/sheet1.xml',`<worksheet xmlns="${E}"><dimension ref="A1:${column(series.length)}${categories.length+1}"/><sheetData>${rows.join('')}</sheetData></worksheet>`);
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
export async function bindNativeChart(zip,part,data,override,template){
  if(data.status!=='ready')throw new Error('原生图表数据尚未通过核查');
  const doc=parse(await zip.file(part).async('string')),plot=first(doc,'plotArea');
  const types=Array.from(plot.childNodes).filter(n=>['barChart','lineChart','pieChart'].includes(n.localName));
  if(types.length!==1)throw new Error('该图表结构暂不支持自动换数，请选择单一柱形、折线或饼图组件');
  const host=types[0],existing=elements(host,'ser'),prototype=existing[0];if(!prototype)throw new Error('原生图表没有可复用的系列');
  const categories=[...new Set(data.records.map(r=>r.x))],series=[...new Set(data.records.map(r=>r.series))],total=categories.length;
  const xmlNode=xml=>doc.importNode(parse(`<root xmlns:c="${C}" xmlns:a="${NS.a}">${xml}</root>`).documentElement.firstChild,true);
  const order=['idx','order','tx','spPr','invertIfNegative','pictureOptions','marker','dPt','dLbls','trendline','errBars','cat','val','smooth','shape','extLst'];
  const replace=(ser,key,xml)=>{const n=child(ser,key),newNode=xmlNode(xml);if(n)ser.replaceChild(newNode,n);else ser.insertBefore(newNode,Array.from(ser.childNodes).find(n=>n.nodeType===1&&order.indexOf(n.localName)>order.indexOf(key))||null);};
  for(const n of existing)host.removeChild(n);
  series.forEach((name,i)=>{const ser=(existing[i%existing.length]||prototype).cloneNode(true);child(ser,'idx')?.setAttribute('val',String(i));child(ser,'order')?.setAttribute('val',String(i));
    replace(ser,'tx',`<c:tx><c:strRef><c:f>Data!$${column(i+1)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`);
    replace(ser,'cat',`<c:cat><c:strRef><c:f>Data!$A$2:$A$${total+1}</c:f><c:strCache><c:ptCount val="${total}"/>${categories.map((x,j)=>`<c:pt idx="${j}"><c:v>${esc(x)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`);
    replace(ser,'val',`<c:val><c:numRef><c:f>Data!$${column(i+1)}$2:$${column(i+1)}$${total+1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${total}"/>${categories.map((x,j)=>{const r=data.records.find(r=>r.x===x&&r.series===name);return r&&r.value!==null?`<c:pt idx="${j}"><c:v>${r.value}</c:v></c:pt>`:'';}).join('')}</c:numCache></c:numRef></c:val>`);
    if(template&&template.designPalette?.mode!=='material'){const style=designSystem(template),colors=style.paletteColors.length?style.paletteColors:[style.primary,style.secondary,style.accent];doc.documentElement.setAttribute('xmlns:a',NS.a);for(const d of elements(ser,'dPt'))d.parentNode.removeChild(d);replace(ser,'spPr',host.localName==='lineChart'?'<c:spPr><a:noFill/><a:ln w="28575"><a:solidFill><a:srgbClr val="'+colors[i%colors.length]+'"/></a:solidFill></a:ln></c:spPr>':'<c:spPr><a:solidFill><a:srgbClr val="'+colors[i%colors.length]+'"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>');if(host.localName==='pieChart')categories.forEach((x,j)=>{const dp=xmlNode('<c:dPt><c:idx val="'+j+'"/><c:spPr><a:solidFill><a:srgbClr val="'+colors[j%colors.length]+'"/></a:solidFill></c:spPr></c:dPt>');ser.insertBefore(dp,child(ser,'cat')||null);});}
    for(const key of ['errBars','trendline'])for(const n of elements(ser,key))n.parentNode.removeChild(n);
    const insertion=Array.from(host.childNodes).find(n=>!['barDir','grouping','varyColors','ser'].includes(n.localName)&&n.nodeType===1);host.insertBefore(ser,insertion||null);
  });
  const grouping=child(host,'grouping');if(grouping&&host.localName==='barChart')grouping.setAttribute('val',data.code==='S03'?'stacked':'clustered');
  for(const d of elements(doc,'dLbl'))d.parentNode.removeChild(d);
  // Material charts may hide every numeric axis. Always show newly bound values.
  let labels=child(host,'dLbls');if(!labels){labels=xmlNode('<c:dLbls/>');host.insertBefore(labels,Array.from(host.childNodes).find(n=>n.nodeType===1&&!['barDir','grouping','varyColors','ser'].includes(n.localName))||null);}
  const labelOrder=['delete','numFmt','spPr','txPr','dLblPos','showLegendKey','showVal','showCatName','showSerName','showPercent','showBubbleSize','separator','showLeaderLines','leaderLines','extLst'];
  for(const [key,value] of [['showVal','1'],['showCatName','0'],['showSerName','0'],['showPercent','0']]){let n=child(labels,key);if(!n){n=xmlNode(`<c:${key}/>`);labels.insertBefore(n,Array.from(labels.childNodes).find(n=>n.nodeType===1&&labelOrder.indexOf(n.localName)>labelOrder.indexOf(key))||null);}n.setAttribute('val',value);}
  for(const n of elements(doc,'numFmt')){n.setAttribute('formatCode','General');n.setAttribute('sourceLinked','0');}
  for(const axis of [...elements(doc,'catAx'),...elements(doc,'valAx')]){const title=child(axis,'title');if(title){const texts=elements(title,'t');texts.forEach((t,i)=>{t.textContent=i===0&&axis.localName==='valAx'?data.unit:'';});}const scaling=child(axis,'scaling');if(scaling)for(const n of [...elements(scaling,'min'),...elements(scaling,'max')])n.parentNode.removeChild(n);}
  const values=data.records.filter(r=>r.value!==null).map(r=>r.value);
  if(['S01','S02'].includes(data.code)&&values.length&&Math.min(...values)>=0&&Math.max(...values)>0)for(const axis of elements(doc,'valAx')){const scaling=child(axis,'scaling');if(scaling){scaling.insertBefore(xmlNode(`<c:max val="${Math.max(...values)*2}"/>`),child(scaling,'extLst')||null);scaling.insertBefore(xmlNode('<c:min val="0"/>'),child(scaling,'extLst')||null);}}
  const title=child(first(doc,'chart'),'title');if(title)elements(title,'t').forEach((t,i)=>{t.textContent=i===0?data.title:'';});
  const chartNode=first(doc,'chart');let blanks=child(chartNode,'dispBlanksAs');if(!blanks){blanks=doc.createElementNS(C,'c:dispBlanksAs');chartNode.insertBefore(blanks,child(chartNode,'showDLblsOverMax')||child(chartNode,'extLst')||null);}blanks.setAttribute('val','gap');
  const rf=zip.file(relPath(part)),rels=rf?parse(await rf.async('string')):parse(`<Relationships xmlns="${NS.rel}"/>`);
  let external=first(doc,'externalData'),rid=external?.getAttribute('r:id');
  let packageRel=elements(rels,'Relationship').find(r=>r.getAttribute('Id')===rid&&r.getAttribute('Type').endsWith('/package'));
  if(!packageRel){rid='rId'+(Math.max(0,...elements(rels,'Relationship').map(r=>+r.getAttribute('Id').replace('rId','')||0))+1);packageRel=rels.createElementNS(NS.rel,'Relationship');packageRel.setAttribute('Id',rid);packageRel.setAttribute('Type',NS.r+'/package');rels.documentElement.appendChild(packageRel);}
  const workbookName=path.posix.basename(part,'.xml')+'-data.xlsx',workbookPart=path.posix.join(path.posix.dirname(part),workbookName);packageRel.setAttribute('Target',workbookName);packageRel.removeAttribute('TargetMode');zip.file(workbookPart,await chartWorkbook(data));override(workbookPart,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if(!external){external=doc.createElementNS(C,'c:externalData');doc.documentElement.insertBefore(external,child(doc.documentElement,'printSettings')||child(doc.documentElement,'extLst')||null);}external.setAttributeNS(NS.r,'r:id',rid);
  zip.file(part,serialize(doc));zip.file(relPath(part),serialize(rels));
  return {categories,series,records:data.records.length,workbookPart};
}
