import {createHash} from 'node:crypto';
import path from 'node:path';
import {openZip,parse,elements,first,resolvePart} from './ooxml.mjs';
function decode(buffer){const u=new TextDecoder('utf-8').decode(buffer);return u.includes('\uFFFD')?new TextDecoder('gb18030').decode(buffer):u;}
export function parseDelimited(text,separator){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===separator&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(s=>s.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw new Error('CSV 的引号没有闭合');row.push(cell);if(row.some(s=>s.trim()))rows.push(row);return rows;
}
const columnIndex=ref=>{const letters=ref.match(/^[A-Z]+/i)?.[0]||'A';let n=0;for(const c of letters.toUpperCase())n=n*26+c.charCodeAt(0)-64;return n-1;};
function profile(rows,name){const header=rows[0]||[],data=rows.slice(1),warnings=[];if(!header.length)throw new Error('数据表为空');if(new Set(header).size!==header.length)warnings.push('存在重复表头，需要明确字段映射');const fields=header.map((name,i)=>{const values=data.map(r=>r[i]??''),present=values.filter(v=>v!==''&&v!==null),identifier=/编号|编码|卷号|订单|样本|(^|_)id($|_)/i.test(String(name));return {name:String(name||`空表头${i+1}`),candidateType:identifier?'identifier':present.every(v=>Number.isFinite(Number(v)))?'number':'text',unit:String(name).match(/[（(]([^）)]+)[）)]/)?.[1]||null,missing:values.length-present.length,unique:new Set(present.map(String)).size};});return {name,status:'profile_only',records:data.length,fields,warnings,headerRow:1};}
export async function readDataFile(buffer,name){
  const ext=path.extname(name).toLowerCase(),sha256=createHash('sha256').update(buffer).digest('hex'),tables=[],issues=[];
  if(['.csv','.tsv'].includes(ext)){const text=decode(buffer).replace(/^\uFEFF/,'');tables.push({name:'数据表',rows:parseDelimited(text,ext==='.tsv'?'\t':',')});}
  else if(ext==='.json'){const value=JSON.parse(decode(buffer)),records=Array.isArray(value)?value:value.records||value.data;if(!Array.isArray(records)||!records.every(r=>r&&typeof r==='object'&&!Array.isArray(r)))throw new Error('JSON 应为对象记录数组');const keys=[...new Set(records.flatMap(r=>Object.keys(r)))];tables.push({name:'数据表',rows:[keys,...records.map(r=>keys.map(k=>r[k]??''))]});}
  else if(ext==='.xlsx'){
    const zip=await openZip(buffer),wb=parse(await zip.file('xl/workbook.xml').async('string')),rels=parse(await zip.file('xl/_rels/workbook.xml.rels').async('string')),map=new Map(elements(rels,'Relationship').map(r=>[r.getAttribute('Id'),resolvePart('xl/workbook.xml',r.getAttribute('Target'))]));
    const shared=zip.file('xl/sharedStrings.xml')?elements(parse(await zip.file('xl/sharedStrings.xml').async('string')),'si').map(n=>elements(n,'t').map(t=>t.textContent).join('')):[];
    let styles=[];const stylesFile=zip.file('xl/styles.xml');if(stylesFile){const d=parse(await stylesFile.async('string')),formats=new Map(elements(d,'numFmt').map(n=>[+n.getAttribute('numFmtId'),n.getAttribute('formatCode')]));const xfs=first(d,'cellXfs');styles=Array.from(xfs?.childNodes||[]).filter(n=>n.localName==='xf').map(n=>{const id=+n.getAttribute('numFmtId');return {id,format:formats.get(id)||(id===9||id===10?'0%':'')};});}
    for(const sheet of elements(wb,'sheet')){const part=map.get(sheet.getAttribute('r:id'));if(!part||!zip.file(part))continue;const d=parse(await zip.file(part).async('string')),rows=[];for(const r of elements(d,'row')){const row=[];for(const c of elements(r,'c')){const type=c.getAttribute('t'),v=first(c,'v')?.textContent,style=styles[+c.getAttribute('s')||0]||{};let value=type==='s'?shared[+v]||'':type==='inlineStr'?elements(c,'t').map(n=>n.textContent).join(''):v??'';
      if(first(c,'f')&&!first(c,'v')){issues.push(`${sheet.getAttribute('name')}!${c.getAttribute('r')} 的公式缺少缓存，请用 Excel 重算后保存`);value='[公式缓存缺失]';}
      if(type!=='s'&&type!=='inlineStr'&&v!==undefined&&Number.isFinite(Number(v))){if(/%/.test(style.format))value=Number((Number(v)*100).toPrecision(12))+'%';else if(/^0{2,}$/.test(style.format))value=String(v).padStart(style.format.length,'0');else if(style.id>=14&&style.id<=22){const date=new Date(Date.UTC(1899,11,30)+Number(v)*86400000);value=date.toISOString().slice(0,10);}}
      row[columnIndex(c.getAttribute('r'))]=value;}
      if(row.some(v=>v!==''&&v!==undefined))rows.push(row);}
      if(elements(d,'mergeCell').length)issues.push(`${sheet.getAttribute('name')} 包含合并单元格，请核查表头和分组粒度`);tables.push({name:sheet.getAttribute('name'),rows});}
  }else throw new Error('图表数据支持 CSV、TSV、JSON、XLSX');
  if(!tables.length)throw new Error('没有找到数据表');
  const profiles=tables.map(t=>profile(t.rows,t.name));const total=profiles.reduce((s,p)=>s+p.records,0);if(total>10000)throw new Error('当前原型最多读取 10000 行，请先明确筛选范围或拆分文件');
  const text=[`数据文件：${name}，SHA256：${sha256}`,issues.length?'数据核查问题：'+issues.join('；'):'',...tables.flatMap(t=>[`工作表：${t.name}；表头在第1个非空行（不自动推断复杂多行表头）`,...t.rows.slice(1).map((row,i)=>`记录 ${i+1}：`+t.rows[0].map((key,j)=>`${key}=${row[j]===undefined||row[j]===''?'[缺失]':row[j]}`).join('；'))])].filter(Boolean).join('\n');
  if(text.length>180000)throw new Error('数据内容过长，请先筛选需要绘图的字段和记录');
  return {name,text,characters:text.length,sha256,profiles,issues,records:total,status:issues.length?'profile_only':'profile_only'};
}
