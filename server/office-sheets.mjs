import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const limit=200000;
export function validateTable(table){
 if(!table||!Array.isArray(table.columns)||!table.columns.length||table.columns.length>100||table.columns.some(v=>typeof v!=='string'||!v.trim()||v.length>100)||new Set(table.columns).size!==table.columns.length)throw Error('表头需为不重复的1–100个列名');
 if(!Array.isArray(table.rows)||table.rows.length>20000||table.rows.length*table.columns.length>limit)throw Error('表格最多2万行、20万个单元格，请分表处理');
 if(table.rows.some(r=>!Array.isArray(r)||r.length!==table.columns.length||r.some(v=>v!==null&&!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)||typeof v==='string'&&v.length>10000)))throw Error('单元格内容或列数无效');
 return table;
}
const plain=v=>v instanceof Date?v.toISOString():v&&typeof v==='object'?v.formula?'='+v.formula:v.richText?v.richText.map(t=>t.text).join(''):v.text??v.result??'':v??null;
export async function readWorkbook(buffer,name){
 const wb=new ExcelJS.Workbook();
 if(/\.xlsx$/i.test(name)){
  const zip=await JSZip.loadAsync(buffer);let total=0;for(const e of Object.values(zip.files)){total+=e._data?.uncompressedSize||0;if(total>40*1024*1024)throw Error('工作簿解压后超过40MB，请拆分上传');}
  if(Object.keys(zip.files).some(p=>/vbaProject|externalLinks/i.test(p)))throw Error('请移除宏和外部链接后上传普通XLSX');
  await wb.xlsx.load(buffer);
 }else if(/\.csv$/i.test(name)){
  const {Readable}=await import('node:stream');await wb.csv.read(Readable.from([buffer]));
 }else throw Error('请上传Excel/WPS导出的 .xlsx 或 .csv');
 const sheets=[];
 for(const ws of wb.worksheets){if(ws.rowCount>20001||ws.columnCount>100||ws.rowCount*ws.columnCount>limit)throw Error('工作表超出2万行或20万单元格限制');if(!ws.rowCount)continue;const count=ws.columnCount,seen=new Set();const columns=Array.from({length:count},(_,i)=>{let n=String(plain(ws.getRow(1).getCell(i+1).value)||'列'+(i+1));while(seen.has(n))n+='_';seen.add(n);return n.slice(0,100);});const rows=[];for(let n=2;n<=ws.rowCount;n++)rows.push(columns.map((_,i)=>plain(ws.getRow(n).getCell(i+1).value)));sheets.push(validateTable({name:ws.name,columns,rows}));}
 if(!sheets.length)throw Error('工作簿没有可读取的工作表');if(sheets.reduce((n,s)=>n+s.rows.length*s.columns.length,0)>limit)throw Error('工作簿合计超过20万个单元格');return sheets;
}
function index(t,column){const i=t.columns.indexOf(column);if(i<0)throw Error('找不到列：'+column);return i;}
function numeric(v){if(v===null||v==='')throw Error('汇总列存在空值，请先清理或选择计数');const n=typeof v==='number'?v:Number(String(v).replace(/,/g,''));if(!Number.isFinite(n))throw Error('汇总列存在非数值，请先整理数据');return n;}
const letter=i=>{let n=i+1,s='';while(n){s=String.fromCharCode(65+(n-1)%26)+s;n=Math.floor((n-1)/26);}return s;};
const functions=new Set(['SUM','AVERAGE','MIN','MAX','COUNT','COUNTA','COUNTIF','COUNTIFS','SUMIF','SUMIFS','IF','IFS','IFERROR','AND','OR','NOT','ROUND','ROUNDUP','ROUNDDOWN','ABS','LEN','LEFT','RIGHT','MID','TRIM','CONCAT','CONCATENATE','TEXT','VALUE','YEAR','MONTH','DAY','DATE','TODAY','VLOOKUP','XLOOKUP','INDEX','MATCH']);
export function safeFormula(formula,table,row){
 if(typeof formula!=='string'||!formula.startsWith('=')||formula.length>1000||/[\[\]!|\\\r\n]/.test(formula)||/https?:|file:|DDE|WEBSERVICE|HYPERLINK|IMPORT|_xlfn/i.test(formula))throw Error('只允许当前工作表内的常用公式，不支持外部链接或网络函数');
 const out=formula.replace(/\{([^{}]+)\}/g,(_,c)=>letter(index(table,c))+row);if(/[{}]/.test(out))throw Error('公式列名占位格式无效');
 for(const hit of out.matchAll(/([A-Z_][A-Z_0-9.]*)\s*\(/gi))if(!functions.has(hit[1].toUpperCase()))throw Error('不支持的公式函数：'+hit[1]);return out;
}
export function applySheetOperations(original,operations){
 let t=structuredClone(validateTable(original));if(!Array.isArray(operations)||!operations.length||operations.length>12)throw Error('每次需提供1–12步操作');
 for(const op of operations){
  if(op.type==='trim'){const cols=(op.columns||t.columns).map(c=>index(t,c));for(const r of t.rows)for(const i of cols)if(typeof r[i]==='string'&&!r[i].startsWith('='))r[i]=r[i].trim();}
  else if(op.type==='dedupe'){const cols=(op.columns?.length?op.columns:t.columns).map(c=>index(t,c)),seen=new Set();t.rows=t.rows.filter(r=>{const k=JSON.stringify(cols.map(i=>r[i]));if(seen.has(k))return false;seen.add(k);return true;});}
  else if(op.type==='sort'){const i=index(t,op.column);t.rows.sort((a,b)=>{const x=a[i],y=b[i];const d=typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''),'zh-CN',{numeric:true});return op.descending?-d:d;});}
  else if(op.type==='filter'){const i=index(t,op.column);if(!['equals','contains','gt','lt','notEmpty'].includes(op.operator))throw Error('筛选条件无效');t.rows=t.rows.filter(r=>op.operator==='equals'?String(r[i]??'')===String(op.value??''):op.operator==='contains'?String(r[i]??'').includes(String(op.value??'')):op.operator==='notEmpty'?r[i]!==null&&r[i]!=='':op.operator==='gt'?numeric(r[i])>numeric(op.value):numeric(r[i])<numeric(op.value));}
  else if(op.type==='formula'){if(typeof op.column!=='string'||!op.column.trim()||op.column.length>100||t.columns.includes(op.column))throw Error('公式需要一个新的、不重复的列名');const formulas=t.rows.map((_,n)=>safeFormula(op.formula,t,n+2));t.columns.push(op.column);t.rows.forEach((r,n)=>r.push(formulas[n]));}
  else if(op.type==='aggregate'||op.type==='pivot'){
   if(!['sum','count','average','min','max'].includes(op.aggregate))throw Error('汇总方式无效');const group=index(t,op.groupBy),measure=op.aggregate==='count'?-1:index(t,op.column),pivot=op.type==='pivot'?index(t,op.pivotBy):-1,groups=new Map(),pivots=[];
   for(const r of t.rows){const k=JSON.stringify(r[group]),p=pivot<0?'结果':String(r[pivot]??'空值');if(!pivots.includes(p))pivots.push(p);if(pivots.length>90)throw Error('交叉分析列数过多');if(!groups.has(k))groups.set(k,{label:r[group],values:new Map()});const v=groups.get(k).values;if(!v.has(p))v.set(p,[]);v.get(p).push(measure<0?1:numeric(r[measure]));}
   const reduce=a=>!a?.length?null:op.aggregate==='count'?a.length:op.aggregate==='sum'?a.reduce((n,v)=>n+v,0):op.aggregate==='average'?a.reduce((n,v)=>n+v,0)/a.length:op.aggregate==='min'?Math.min(...a):Math.max(...a);
   const names=pivot<0?[op.aggregate+'_'+(op.column||'行数')]:pivots.map(p=>'统计_'+p);t={name:t.name,columns:[op.groupBy,...names],rows:[...groups.values()].map(g=>[g.label,...pivots.map(p=>reduce(g.values.get(p)))])};
  }else throw Error('不支持的表格操作：'+op.type);
  validateTable(t);
 }return t;
}
export async function writeWorkbook(table,{formulas=false}={}){
 validateTable(table);const wb=new ExcelJS.Workbook();wb.creator='叙帧';wb.calcProperties.fullCalcOnLoad=true;const ws=wb.addWorksheet('处理结果');ws.addRow(table.columns);ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF164C78'}};
 for(const row of table.rows)ws.addRow(row.map(v=>formulas&&typeof v==='string'&&v.startsWith('=')?{formula:safeFormula(v,table,2).slice(1)}:v));ws.columns.forEach(c=>{c.width=24;});ws.views=[{state:'frozen',ySplit:1}];if(table.rows.length)ws.autoFilter={from:{row:1,column:1},to:{row:table.rows.length+1,column:table.columns.length}};return Buffer.from(await wb.xlsx.writeBuffer());
}
