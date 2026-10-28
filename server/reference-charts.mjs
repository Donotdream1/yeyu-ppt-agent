import {parse,serialize,elements,relPath,resolvePart} from './ooxml.mjs';
import {bindNativeChart,chartWorkbook} from './native-charts.mjs';

export async function bindReferencePageCharts(zip,part,datasets,override,files,page){
 const rels=parse(await zip.file(relPath(part)).async('string')),doc=parse(await zip.file(part).async('string')),tags=elements(doc,'chart');
 if(datasets.length!==tags.length)throw Error('原生参考页图表数据未完整提交');
 for(const [index,tag]of tags.entries()){
  const input=datasets.find(d=>d.index===index);if(!input)throw Error('缺少原生图表数据');
  const rel=elements(rels,'Relationship').find(r=>r.getAttribute('Id')===tag.getAttribute('r:id')),target=resolvePart(part,rel.getAttribute('Target'));
  const data={...input,code:'N'+String(index+1).padStart(2,'0'),status:'ready',title:input.records.length?(input.is_simulated||input.isSimulated?'模拟数据，仅示意 · '+input.title:input.title):'待补充数据',records:input.records,unit:input.unit||'',grain:'用户文档逐字来源',issues:input.records.length?[]:['未提供真实数据，已清除模板示例值'],source:'用户文档',is_simulated:Boolean(input.is_simulated||input.isSimulated)};
  const chart=parse(await zip.file(target).async('string')),supported=['barChart','lineChart','pieChart'].some(k=>elements(chart,k).length);
  if(supported)await bindNativeChart(zip,target,data,override);
  else{
   if(input.records.length)throw Error('此原生图表暂不支持安全换数');
   for(const n of elements(chart,'ser'))n.parentNode.removeChild(n);
   for(const n of elements(chart,'numCache'))n.parentNode.removeChild(n);
   zip.file(target,serialize(chart));
   const rf=zip.file(relPath(target));if(rf)for(const r of elements(parse(await rf.async('string')),'Relationship').filter(r=>r.getAttribute('Type').endsWith('/package')))zip.file(resolvePart(target,r.getAttribute('Target')),await chartWorkbook(data));
  }
  files.push({page,code:data.code,title:data.title,data:{...data,status:input.records.length?'ready':'blocked'}});
 }
}
