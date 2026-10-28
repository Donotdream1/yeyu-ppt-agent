import {createHash} from 'node:crypto';
import {parse,esc,NS,textShape} from './ooxml.mjs';

export const CHART_CODES=['S01','S02','S03','S04','S05','S06','S07','S08','S09','C01','C02','C03','C04','C05'];
export const CHART_RULES=`图表必须先准备数据再绘图。只使用原文或数据表中的可验证数值，每条记录提供 sourceQuote（原文逐字摘录）。不把订单号、样本编号或日期当度量。不补零、不凭空汇总，不从均值反造样本。null 表示缺失。比例保留输入尺度并说明分母，百分数42代表42%。均值、标准差、标准误和置信区间不可混用。没有原始样本不能制作箱线图。图号固定为 S01单柱、S02分组柱、S03堆叠柱、S04饼图、S05折线、S06箱线及原始样本、S07散点、S08直方、S09热力、C01柱折双轴、C02堆叠柱折双轴、C03分组柱折双轴、C04双折双轴、C05帕累托。统计口径不清楚则 status=blocked 并列出 issues，不生成图形。`;
export function prepareChart(chart,document,sourceName='用户文档'){
  const issues=[],warnings=[],transformations=[],records=(chart.records||[]).map((r,i)=>({...r,x:String(r.x??''),series:String(r.series||'数值'),unit:r.unit||chart.unit||'',axis:r.axis||'left',mark:r.mark||(chart.code==='S05'||chart.code==='C04'?'line':'bar'),source_rows:r.source_rows||[i+1],value:(r.source_value??r.value)===null?null:Number(r.source_value??r.value)}));
  const hash=createHash('sha256').update(document).digest('hex');
  if(!CHART_CODES.includes(chart.code))issues.push('图号未包含在支持范围内');
  if(!records.length)issues.push('没有绘图数据');
  if(records.length>2000)issues.push('单图最多支持 2000 条记录，请先明确筛选或汇总规则');
  if(!chart.unit?.trim())issues.push('缺少数值单位');
  if(!chart.grain?.trim())issues.push('缺少原始数据和绘图粒度说明');
  if(chart.status==='blocked')issues.push(...(chart.issues?.length?chart.issues:['原文不足以确定图表口径']));
  if(chart.status==='profile_only')issues.push('目前只完成结构画像，尚未确定绘图口径');
  const normalized=document.replaceAll(',','').replaceAll('，','');
  const numberPresent=(v,quote)=>{if(v===null)return true;const nums=(quote||'').replaceAll(',','').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g)||[];return nums.some(n=>Number(n)===Number(v));};
  for(const [i,r] of records.entries()){
    if(r.value!==null&&!Number.isFinite(r.value))issues.push(`记录 ${i+1} 不是有效数值`);
    const quote=r.sourceQuote||'';
    if(!quote||!normalized.includes(quote.replaceAll(',','').replaceAll('，','')))issues.push(`记录 ${i+1} 缺少可核对的原文摘录`);
    else if(!numberPresent(r.value,quote))issues.push(`记录 ${i+1} 的数值未出现在原文摘录中`);
    if(chart.code==='S07'&&(!Number.isFinite(Number(r.x))||!numberPresent(Number(r.x),quote)))issues.push(`散点 ${i+1} 的 X 值缺少同一观测对象的依据`);
  }
  if(chart.aggregation&&chart.aggregation!=='none')issues.push('当前自动制图只接受已确定的绘图记录；需要汇总时请提供明确转换后的数据和依据');
  const keys=new Set();
  if(!['S06','S07','S08'].includes(chart.code))for(const r of records){const key=[r.x,r.series,r.row||''].join('\u0000');if(keys.has(key))issues.push('绘图键重复，未明确聚合规则');keys.add(key);}
  const rateRecords=records.filter(r=>/%|百分/.test(r.unit||'')||(chart.measureType==='rate'&&r.unit===chart.unit));
  let fractionsConverted=0;
  for(const r of rateRecords){
    if(r.value===null)continue;
    const scale=r.rateScale||chart.rateScale||(/[%％]/.test(r.sourceQuote||'')?'percent_text':null);
    if(!scale)issues.push('比例输入尺度不明确，需要区分 0–1 小数和 0–100 百分数');
    else if(scale==='fraction'){
      if(!/(0\\s*[-—–至]\\s*1|比例以小数|小数比例|比例为小数)/.test(document))issues.push('小数比例缺少明确的尺度依据，不能从数值大小猜测');
      else{r.source_value=r.value;r.value=Number((r.value*100).toPrecision(12));r.unit='%';fractionsConverted++;}
    }
  }
  if(fractionsConverted)transformations.push({operation:'fraction_to_percent',factor:100,records:fractionsConverted,rule:'原文明示 0–1 小数比例，统一输出百分数值'});
  if(chart.code==='S09'&&records.some(r=>!r.row))issues.push('热力图缺少明确的行维度');
  const values=records.filter(r=>r.value!==null).map(r=>r.value);
  if(['S02','S03','C01','C02','C03','C04'].includes(chart.code)){const categories=uniq(records.map(r=>r.x)),series=uniq(records.map(r=>r.series));for(const x of categories)for(const s of series)if(!records.some(r=>r.x===x&&r.series===s&&r.value!==null))issues.push(`类别 ${x} 缺少系列 ${s} 的数值，不会补零`);}
  if(!values.length)issues.push('没有可绘制的有效数值，缺失值不会自动补零');
  if(new Set(records.map(r=>r.series)).size>4)issues.push('系列超过当前单图布局容量，请明确分图方式');
  if(chart.code==='S04'&&records.length>10)issues.push('饼图类别过多，请明确分类或分图，不能静默合并类别');
  if(['S03','S04','C02','C05'].includes(chart.code)&&values.some(v=>v<0))issues.push('堆叠、构成或帕累托数据不能为负数');
  if(['S04'].includes(chart.code)&&!chart.population)issues.push('饼图需要说明互斥分类及共同总体');
  if(['S04','C05'].includes(chart.code)&&values.reduce((s,v)=>s+v,0)<=0)issues.push('构成或帕累托图的总量必须大于零');
  if(chart.code==='S04'&&chart.measureType==='rate'&&Math.abs(values.reduce((s,v)=>s+v,0)-100)>.5)issues.push('占比之和不为 100%，请核查分母和输入尺度');
  if(['S06','S08'].includes(chart.code)&&chart.measureType!=='raw')issues.push('箱线图和直方图必须提供原始样本，不能使用组均值');
  if(chart.code==='S07'&&!chart.xUnit)issues.push('散点图缺少 X 轴单位');
  if(/^C0[1-4]$/.test(chart.code)&&(!records.some(r=>r.axis==='left')||!records.some(r=>r.axis==='right')))issues.push('双轴图必须明确左右轴系列及单位');
  for(const axis of ['left','right'])if(new Set(records.filter(r=>r.axis===axis).map(r=>r.unit)).size>1)issues.push(`同一 ${axis} 坐标轴存在不同单位`);
  if(values.length&&Math.min(...values)===Math.max(...values))warnings.push('所有有效数值相同');
  const status=issues.length?'blocked':'ready';
  const files=[...document.matchAll(/(?:数据|文档)文件：([^\n，]+)，SHA256：([a-f0-9]{64})/g)].map(m=>({name:m[1],sha256:m[2]}));
  return {protocol_version:'1.0',...chart,status,records,source:{file:sourceName,document_text_sha256:hash,files,rowsMeaning:'sourceQuote 对应原文；source_rows 为提取记录顺序，不冒充原文件行号'},is_simulated:/模拟数据|模拟测试/.test(document),aggregation:chart.aggregation||'none',issues:[...new Set(issues)],warnings,transformations,font:'微软雅黑'};
}
const uniq=arr=>[...new Set(arr)];
const colors=['#333399','#4A84B8','#9CC8D8','#E69F56','#9678AA','#5C9A86'];
const q=(arr,p)=>{const a=[...arr].sort((x,y)=>x-y),index=(a.length-1)*p;return a[Math.floor(index)]+(a[Math.ceil(index)]-a[Math.floor(index)])*(index%1);};
export function drawChart(data,theme={primary:'333399',secondary:'BBE0E3'}){
  if(data.status!=='ready')return null;
  const width=1200,height=650,P=[],font='微软雅黑';
  const add=(kind,props)=>P.push({kind,...props});
  const line=(x1,y1,x2,y2,color='#D5DDE3',stroke=1.2)=>add('line',{x1,y1,x2,y2,color,stroke});
  const text=(value,x,y,size=19,color='#26333F',anchor='start')=>add('text',{text:String(value),x,y,size,color,anchor});
  const rect=(x,y,w,h,fill,stroke='none')=>add('rect',{x,y,w,h,fill,stroke});
  const circle=(x,y,r,fill)=>add('circle',{x,y,r,fill});
  const poly=(points,fill,stroke='none',strokeWidth=1.5,closed=false)=>add('poly',{points,fill,stroke,strokeWidth,closed});
  const palette=[...new Set((theme.chartColors?.length?theme.chartColors:[theme.primary,theme.secondary]).filter(v=>/^[a-f0-9]{6}$/i.test(v)).map(v=>'#'+v))];if(!palette.length)palette.push('#'+theme.primary);
  text(data.title,55,41,27);text(data.unit?`单位：${data.unit}`:'',55,74,15,'#657382');
  let records=data.records.filter(r=>r.value!==null),categories=uniq(data.records.map(r=>r.x)),series=uniq(records.map(r=>r.series));
  const L=105,R=1090,T=135,B=545,W=R-L,H=B-T;
  const format=v=>Number.isInteger(v)?String(v):Number(v.toPrecision(4)).toString();
  const axes=(minimum,maximum,rightMax=null)=>{
    const lo=Math.min(0,minimum),hi=Math.max(maximum,lo+1),span=hi-lo;
    for(let i=0;i<=4;i++){const v=lo+span*i/4,y=B-H*i/4;line(L,y,R,y);text(format(v),L-13,y+6,15,'#697786','end');if(rightMax!==null)text(format(rightMax*i/4),R+13,y+6,15,'#697786');}
    line(L,T,L,B,'#A3AFB9',1);line(L,B,R,B,'#A3AFB9',1);return v=>B-(v-lo)/span*H;
  };
  if(data.code==='S04'){
    const total=records.reduce((s,r)=>s+r.value,0),cx=390,cy=337,radius=210;let angle=-Math.PI/2;
    records.forEach((r,i)=>{const span=r.value/total*Math.PI*2,points=[[cx,cy],...Array.from({length:Math.max(3,Math.ceil(span*30))+1},(_,j)=>{const a=angle+span*j/Math.max(3,Math.ceil(span*30));return [cx+Math.cos(a)*radius,cy+Math.sin(a)*radius];})];poly(points,palette[i%palette.length],'#FFFFFF',2,true);rect(760,155+i*49,19,19,palette[i%palette.length]);text(`${r.x}  ${format(r.value)}（${(r.value/total*100).toFixed(1)}%）`,793,172+i*49,20);angle+=span;});
    data.transformations.push({operation:'pie_share',total,method:'value / total * 100'});
  }else if(data.code==='S09'){
    const rows=uniq(data.records.map(r=>r.row||r.series)),cols=categories,min=Math.min(...records.map(r=>r.value)),max=Math.max(...records.map(r=>r.value));const cw=W/cols.length,ch=H/rows.length;
    rows.forEach((r,i)=>text(r,L-14,T+i*ch+ch*.57,17,'#455566','end'));
    cols.forEach((c,i)=>text(c,L+i*cw+cw/2,B+31,17,'#455566','middle'));
    data.records.forEach(r=>{const i=rows.indexOf(r.row||r.series),j=cols.indexOf(r.x),t=r.value===null?0:(r.value-min)/(max-min||1);const fill=r.value===null?'#FFFFFF':palette[Math.min(palette.length-1,Math.floor(t*palette.length))];rect(L+j*cw,T+i*ch,cw-2,ch-2,fill);text(r.value===null?'缺失':format(r.value),L+j*cw+cw/2,T+i*ch+ch*.57,17,t>.6?'#FFFFFF':'#26333F','middle');});
  }else if(data.code==='S06'){
    const groups=uniq(records.map(r=>r.x));const values=records.map(r=>r.value),y=axes(Math.min(...values),Math.max(...values)*1.12),cw=W/groups.length;
    groups.forEach((g,i)=>{const values=records.filter(r=>r.x===g).map(r=>r.value).sort((a,b)=>a-b),q1=q(values,.25),median=q(values,.5),q3=q(values,.75),iqr=q3-q1,low=values.find(v=>v>=q1-1.5*iqr),high=values.findLast(v=>v<=q3+1.5*iqr),cx=L+cw*(i+.5);rect(cx-cw*.2,y(q3),cw*.4,y(q1)-y(q3),palette[i%palette.length],'#435569');line(cx-cw*.2,y(median),cx+cw*.2,y(median),'#FFFFFF',3);line(cx,y(high),cx,y(q3),'#435569',1.5);line(cx,y(low),cx,y(q1),'#435569',1.5);line(cx-cw*.1,y(high),cx+cw*.1,y(high),'#435569');line(cx-cw*.1,y(low),cx+cw*.1,y(low),'#435569');values.forEach((v,j)=>circle(cx+(((j*37)%101)/100-.5)*cw*.18,y(v),3.6,'#202A35'));text(`${g} (n=${values.length})`,cx,B+32,17,'#455566','middle');data.transformations.push({operation:'boxplot_summary',group:g,quartiles:'linear interpolation',q1,median,q3,whiskerRule:'1.5 IQR, observed endpoints',low,high,n:values.length});});
  }else if(data.code==='S07'){
    const xs=records.map(r=>Number(r.x)),ys=records.map(r=>r.value),xmin=Math.min(...xs),xmax=Math.max(...xs),y=axes(Math.min(...ys),Math.max(...ys)*1.08);records.forEach(r=>circle(L+(+r.x-xmin)/(xmax-xmin||1)*W,y(r.value),6,palette[series.indexOf(r.series)%palette.length]));for(let i=0;i<=5;i++)text(format(xmin+(xmax-xmin)*i/5),L+W*i/5,B+31,16,'#657382','middle');text(data.xUnit||'',(L+R)/2,615,17,'#657382','middle');
  }else if(data.code==='S08'){
    const values=records.map(r=>r.value),min=Math.min(...values),max=Math.max(...values),count=Math.max(1,Math.ceil(Math.log2(values.length)+1)),step=(max-min||1)/count,bins=Array.from({length:count},(_,i)=>({low:min+i*step,high:min+(i+1)*step,count:0}));for(const v of values)bins[Math.min(count-1,Math.floor((v-min)/step))].count++;const y=axes(0,Math.max(...bins.map(b=>b.count))*1.15);bins.forEach((b,i)=>{const x=L+i*W/count;rect(x+1,y(b.count),W/count-2,B-y(b.count),palette[0]);if(i%Math.max(1,Math.ceil(count/10))===0)text(format(b.low),x,B+28,15,'#657382');});text('频数',L,T-20,16);data.transformations.push({operation:'histogram',binRule:'Sturges',binCount:count,bins});
  }else{
    let pareto=null;
    if(data.code==='C05'){records=[...records].sort((a,b)=>b.value-a.value);categories=records.map(r=>r.x);const total=records.reduce((s,r)=>s+r.value,0);let cumulative=0;pareto=records.map(r=>({x:r.x,value:(cumulative+=r.value)/total*100}));data.transformations.push({operation:'pareto',total,cumulative:pareto});}
    const stacked=['S03','C02'].includes(data.code),lineOnly=['S05','C04'].includes(data.code),dual=/^C0[1-4]$/.test(data.code)||data.code==='C05';
    const left=records.filter(r=>r.axis!=='right'),right=records.filter(r=>r.axis==='right'),maxLeft=stacked?Math.max(...categories.map(x=>left.filter(r=>r.x===x&&r.mark!=='line').reduce((s,r)=>s+r.value,0)),...left.filter(r=>r.mark==='line').map(r=>r.value)):Math.max(1,...left.map(r=>r.value));
    const maxRight=pareto?100:Math.max(1,...right.map(r=>r.value))*1.1,headroom=['S01','S02','C01','C03'].includes(data.code)?2:1.13,y=axes(Math.min(0,...left.map(r=>r.value)),maxLeft*headroom,dual?maxRight:null),yr=v=>B-v/maxRight*H,cw=W/categories.length;
    data.axis_scale={left_y_max:maxLeft*headroom,right_y_max:dual?maxRight:null};
    if(dual){text('左轴：'+(left[0]?.unit||data.unit),L,T-22,15,'#657382');text('右轴：'+(pareto?'%':right[0]?.unit||''),R,T-22,15,'#657382','end');}
    const barSeries=series.filter(s=>records.some(r=>r.series===s&&!lineOnly&&r.mark!=='line'&&r.axis!=='right'));
    const acc=new Map();records.filter(r=>!lineOnly&&r.mark!=='line'&&r.axis!=='right').forEach(r=>{const cat=categories.indexOf(r.x),si=barSeries.indexOf(r.series),bw=cw*.68/(stacked?1:Math.max(1,barSeries.length)),base=stacked?(acc.get(r.x)||0):0,x=L+cat*cw+cw*.16+(stacked?0:si*bw),top=y(r.value+base),bottom=y(base);rect(x,Math.min(top,bottom),bw*.94,Math.max(1,Math.abs(bottom-top)),palette[series.indexOf(r.series)%palette.length]);if(stacked)acc.set(r.x,base+r.value);if(categories.length<=12)text(format(r.value),x+bw*.47,top-9,15,'#536475','middle');});
    series.filter(s=>lineOnly||records.some(r=>r.series===s&&(r.mark==='line'||r.axis==='right'))).forEach(s=>{let points=[];const flush=()=>{if(points.length>1)poly(points,'none',palette[series.indexOf(s)%palette.length],3);points=[];};for(const x of categories){const r=data.records.find(r=>r.series===s&&r.x===x);if(!r||r.value===null){flush();continue;}const p=[L+(categories.indexOf(x)+.5)*cw,r.axis==='right'?yr(r.value):y(r.value)];points.push(p);circle(...p,4,palette[series.indexOf(s)%palette.length]);}flush();});
    if(pareto){const points=pareto.map((r,i)=>[L+(i+.5)*cw,yr(r.value)]);poly(points,'none',palette[3],3);points.forEach(p=>circle(...p,4,palette[3]));}
    categories.forEach((c,i)=>text(c,L+(i+.5)*cw,B+31,Math.max(11,18-categories.length*.2),'#536475','middle'));
    series.forEach((s,i)=>{rect(300+i*190,65,14,14,palette[i%palette.length]);text(s,322+i*190,78,15);});
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font},微软雅黑,sans-serif"><rect width="100%" height="100%" fill="white"/>${P.map(p=>p.kind==='text'?`<text x="${p.x}" y="${p.y}" font-size="${p.size}" fill="${p.color}" text-anchor="${p.anchor}">${esc(p.text)}</text>`:p.kind==='line'?`<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${p.color}" stroke-width="${p.stroke}"/>`:p.kind==='rect'?`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.fill}" stroke="${p.stroke}"/>`:p.kind==='circle'?`<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${p.fill}"/>`:`<${p.closed?'polygon':'polyline'} points="${p.points.map(a=>a.join(',')).join(' ')}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}"/>`).join('')}</svg>`;
  return {svg,primitives:P,width,height};
}
function color(v){if(v.startsWith('#'))return v.slice(1);const m=v.match(/rgb\((\d+),(\d+),(\d+)\)/);return m?m.slice(1).map(n=>(+n).toString(16).padStart(2,'0')).join(''):'FFFFFF';}
function primitiveXml(p,id){
  const U=9525;let x,y,w,h,geom,fill='none',stroke='none',strokeW=1;
  if(p.kind==='text'){const width=Math.max(80,p.text.length*p.size*1.4),left=p.anchor==='middle'?p.x-width/2:p.anchor==='end'?p.x-width:p.x;return textShape(id,p.text,Math.round(left*U),Math.round((p.y-p.size)*U),Math.round(width*U),Math.round(p.size*1.85*U),p.size*.75,color(p.color)).replaceAll('Microsoft YaHei','微软雅黑').replaceAll('<a:spcPts val="1400"/>','<a:spcPts val="0"/>');}
  if(p.kind==='rect'){({x,y,w,h}=p);fill=p.fill;stroke=p.stroke;geom='<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';}
  else if(p.kind==='circle'){x=p.x-p.r;y=p.y-p.r;w=h=2*p.r;fill=p.fill;geom='<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>';}
  else{const points=p.kind==='line'?[[p.x1,p.y1],[p.x2,p.y2]]:p.points;x=Math.min(...points.map(p=>p[0]));y=Math.min(...points.map(p=>p[1]));w=Math.max(1,Math.max(...points.map(p=>p[0]))-x);h=Math.max(1,Math.max(...points.map(p=>p[1]))-y);fill=p.fill||'none';stroke=p.color||p.stroke;strokeW=p.strokeWidth||p.stroke||1;geom=`<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${Math.round(w*U)}" h="${Math.round(h*U)}">${points.map((v,i)=>`<a:${i?'lnTo':'moveTo'}><a:pt x="${Math.round((v[0]-x)*U)}" y="${Math.round((v[1]-y)*U)}"/></a:${i?'lnTo':'moveTo'}>`).join('')}${p.closed?'<a:close/>':''}</a:path></a:pathLst></a:custGeom>`;}
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Chart ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x*U)}" y="${Math.round(y*U)}"/><a:ext cx="${Math.max(1,Math.round(w*U))}" cy="${Math.max(1,Math.round(h*U))}"/></a:xfrm>${geom}${fill&&fill!=='none'?`<a:solidFill><a:srgbClr val="${color(fill)}"/></a:solidFill>`:'<a:noFill/>'}<a:ln w="${Math.round((typeof strokeW==='number'?strokeW:1)*U)}">${stroke&&stroke!=='none'?`<a:solidFill><a:srgbClr val="${color(stroke)}"/></a:solidFill>`:'<a:noFill/>'}</a:ln></p:spPr></p:sp>`;
}
export async function chartForDeck(chart,template,block,nextId){
  const data=chart.prepared||chart;
  if(data.status!=='ready'){const node=parse(`<root xmlns:p="${NS.p}" xmlns:a="${NS.a}">${textShape(nextId++,'图表数据待核查\n'+(data.issues||[]).join('\n'),Math.round(block.x*template.width),Math.round(block.y*template.height),Math.round(block.w*template.width),Math.round(block.h*template.height),20,'875A32')}</root>`).documentElement.firstChild;return {node,nextId,warnings:data.issues||['图表未达到 ready 状态'],files:{code:data.code,data,blocked:true}};}
  const drawing=drawChart(data,template.theme),id=nextId++;
  const node=parse(`<p:grpSp xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:nvGrpSpPr><p:cNvPr id="${id}" name="${data.code} ${esc(data.title)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${Math.round(block.x*template.width)}" y="${Math.round(block.y*template.height)}"/><a:ext cx="${Math.round(block.w*template.width)}" cy="${Math.round(block.h*template.height)}"/><a:chOff x="0" y="0"/><a:chExt cx="${drawing.width*9525}" cy="${drawing.height*9525}"/></a:xfrm></p:grpSpPr>${drawing.primitives.map(p=>primitiveXml(p,nextId++)).join('')}</p:grpSp>`).documentElement;
  const sharp=(await import('sharp')).default,png=await sharp(Buffer.from(drawing.svg),{density:240}).png().withMetadata({density:240}).toBuffer();
  return {node,nextId,files:{code:data.code,title:data.title,svg:drawing.svg,png,data},warnings:data.warnings||[]};
}
