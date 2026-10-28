// Page metadata and matching are deliberately independent of model/network calls.
export const TAG_VERSION=2;
export const PAGE_PURPOSES=['封面','目录','章节过渡','背景介绍','现状问题','目标展示','举措方案','流程说明','数据分析','成果展示','案例展示','总结计划','结束页','图标集','素材说明','待核查'];
export const PAGE_LOGICS=['并列','总分','递进','流程','时间','层级','对比','因果','循环','关联','矩阵','待核查'];
export function reviewedPageClassification(card,fallback={}){
 if(!['已视觉复核','已人工复核'].includes(card?.review?.status))return fallback;
 const purpose=({'封面':'cover','目录':'agenda','结束页':'ending','素材说明':'instruction','图标集':'instruction'})[card.purpose?.main]||'content';
 const relation=purpose==='agenda'?'agenda':({'并列':'parallel','总分':card.structure?.centerCount?'hub':'hierarchy','递进':'process','流程':'process','时间':'timeline','层级':'hierarchy','对比':'compare','因果':'process','循环':'cycle','关联':card.structure?.centerCount?'hub':'parallel','矩阵':'matrix'})[card.logic?.primary]||fallback.relation;
 return {purpose,relation};
}
const unique=values=>[...new Set(values.filter(Boolean))];
const textLength=s=>Array.from(String(s||'').replace(/\s/g,'')).length;
export function characterCounts(text){const s=String(text||'');return {characters:textLength(s),chinese:(s.match(/[\u3400-\u9fff]/g)||[]).length,englishWords:(s.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g)||[]).length};}
export function capacityRange(slot){
 const p=slot.position,sizes=(slot.fontSizesPt||[]).filter(n=>Number.isFinite(n)&&n>0);if(!sizes.length&&Number.isFinite(slot.font)&&slot.font>0)sizes.push(slot.font);if(slot.fontResolved===false||!sizes.length||!p?.wPt||!p?.hPt)return {min:0,max:0,confidence:'低',basis:'字号或文本框尺寸未确认，容量待核查'};const font=Math.max(8,...sizes);
 const columns=Math.max(1,Math.floor(Math.max(font,p.wPt-6)/font)),lines=Math.max(1,Math.floor(Math.max(font,p.hPt-3)/(font*1.2))),max=Math.max(1,Math.min(500,Math.floor(columns*lines*.8)));
 return {min:Math.max(1,Math.floor(max*.6)),max,confidence:'中',basis:'文本框实际尺寸、源pt字号及保守行列估算；不以原页字数充当容量'};
}
export function inferPurpose(title,{kind,charts=0,textSlots=0,images=0,iconBoard=false}={}){
 if(/购买须知|免责声明|版权|使用说明|加我微信|终于等到|500页汇报PPT模版/.test(title))return '素材说明';
 if(iconBoard)return '图标集';if(!textSlots&&images===0)return '待核查';
 if(!String(title).trim()||/^第\s*\d+\s*页$/.test(String(title).trim()))return '待核查';
 if(kind==='cover')return '封面';if(kind==='agenda'||/目录|CONTENTS?|AGENDA/i.test(title))return '目录';
 if(kind==='ending'||/谢谢|感谢聆听|THANK/i.test(title))return '结束页';
 if(/章节|过渡/.test(title))return '章节过渡';if(/案例|实践分享/.test(title))return '案例展示';
 if(/数据|指标|统计|占比|趋势|测试结果|分析报告/.test(title))return '数据分析';
 if(/现状|问题|不足|痛点|难点|优缺点/.test(title))return '现状问题';if(/背景|必要性|概况|认识|定位|介绍/.test(title))return '背景介绍';
 if(/目标|愿景/.test(title))return '目标展示';if(/成果|成绩|业绩|成效|工作亮点/.test(title))return '成果展示';
 if(/流程|路径|步骤|路线|链路/.test(title))return '流程说明';if(/总结|计划|展望|后续|下一步/.test(title))return '总结计划';
 return /举措|措施|方案|策略|模型|架构|系统|逻辑关系/.test(title)?'举措方案':charts>0?'数据分析':'待核查';
}
export function inferLogic(title,relation,hasTable=false){
 if(hasTable)return '矩阵';
 for(const [label,re]of [['循环',/循环|闭环/],['因果',/因果|原因.*结果|问题.*原因/],['对比',/对比|比较|优势.*劣势|优缺点|VS/i],['时间',/时间轴|历程|里程碑|甘特/],['层级',/层级|架构|层次|金字塔|组织架构/],['总分',/总分|中心.*支撑|包含关系/],['递进',/递进/],['流程',/流程|步骤|路径|链路/],['并列',/并列/]])if(re.test(title))return label;
 return ({parallel:'并列',process:'流程',timeline:'时间',hierarchy:'层级',architecture:'层级',compare:'对比',cycle:'循环',hub:'关联',responsibility:'关联',matrix:'矩阵'})[relation]||'待核查';
}
export function inferModules(slots,{widthPt,heightPt}={}){
 const free=slots.filter(s=>!s.fixed&&!s.decorative&&s.position&&s.position.y>=.16&&s.position.y<.91),body=free.filter(s=>s.role==='body'&&s.position.w>=.07&&s.position.w<.65&&s.position.h>=.035);
 let selected=body.length>=2&&body.length<=12?body:free.filter(s=>s.role==='label'&&textLength(s.sample)>=2&&s.position.w>=.065&&s.position.w<.45&&s.position.h>=.025&&s.position.h<.22);
 const cluster=[];for(const slot of selected){const p=slot.position;if(cluster.some(v=>Math.abs(v.position.x-p.x)<.025&&Math.abs(v.position.y-p.y)<.035))continue;cluster.push(slot);}
 const valid=cluster.length>=2&&cluster.length<=12,regions=valid?cluster:body.length===1?body:[],center=regions.length>=4?[...regions,...free.filter(s=>s.role==='label'&&!regions.includes(s))].find(s=>{
  const p=s.position,cx=p.x+p.w/2,cy=p.y+p.h/2,others=regions.filter(v=>v!==s),font=Math.max(s.font||0,...(s.fontSizesPt||[])),peerFont=others.reduce((sum,v)=>sum+(v.font||0),0)/Math.max(1,others.length);
  const sameRow=others.some(v=>Math.abs(v.position.y+v.position.h/2-cy)<.035),sameColumn=others.some(v=>Math.abs(v.position.x+v.position.w/2-cx)<.035);
  const ordinaryHeading=s.role==='label'&&regions.some(v=>Math.abs(v.position.x+v.position.w/2-cx)<.08&&v.position.y>=p.y+p.h-.02&&v.position.y-(p.y+p.h)<.12);
  return !ordinaryHeading&&(!(sameRow&&sameColumn)||font>peerFont*1.15)&&Math.abs(cx-.5)<.09&&cy>.32&&cy<.72&&p.w>.12&&others.some(v=>v.position.x+v.position.w/2<cx-.12)&&others.some(v=>v.position.x+v.position.w/2>cx+.12)&&others.some(v=>v.position.y+v.position.h/2<cy-.05)&&others.some(v=>v.position.y+v.position.h/2>cy+.05);
 }):null;
 const modules=regions.filter(s=>s!==center).map((slot,index)=>{const labels=free.filter(s=>s!==slot&&s.role==='label'&&s.sample.length>=2&&Math.abs((s.position.x+s.position.w/2)-(slot.position.x+slot.position.w/2))<.10&&s.position.y+s.position.h<=slot.position.y+.02&&slot.position.y-(s.position.y+s.position.h)<.14).sort((a,b)=>b.position.y-a.position.y),heading=slot.role==='label'?slot:labels[0];return {id:'m'+(index+1),slotKeys:[slot.key,...(heading&&heading!==slot?[heading.key]:[])],position:slot.position,titleCapacity:heading?capacityRange(heading):undefined,bodyCapacity:slot.role==='body'?capacityRange(slot):{min:0,max:0,confidence:'低',basis:'仅识别到短标签，未确认独立正文区'},originalBody:slot.role==='body'?characterCounts(slot.sample):{characters:0,chinese:0,englishWords:0}};});
 const xs=modules.map(m=>m.position.x),ys=modules.map(m=>m.position.y),rows=unique(ys.map(y=>Math.round(y/.07))).length,cols=unique(xs.map(x=>Math.round(x/.09))).length;
 return {moduleCount:modules.length||null,centerCount:center?1:0,supportCount:center?modules.length:0,totalRegions:modules.length+(center?1:0),center:center?{id:'center',slotKeys:[center.key],position:center.position,titleCapacity:center.role==='label'?capacityRange(center):undefined,bodyCapacity:center.role==='body'?capacityRange(center):{min:0,max:0,confidence:'低'},originalBody:center.role==='body'?characterCounts(center.sample):{characters:0,chinese:0,englishWords:0}}:null,moduleCountConfidence:modules.length?'中':'低',modules,layout:!modules.length?'待核查':center?'中心环绕':rows===1?'横向串联':cols===1?'纵向串联':rows===2&&cols>=2?'网格':'自由排布',balance:!modules.length?'待核查':Math.max(...modules.map(m=>m.position.w))/Math.min(...modules.map(m=>m.position.w))<1.35?'等量模块':'主次模块',variability:modules.length?'固定数量':'待核查',countBasis:body.length>=2?'独立正文区聚类，主标题、页眉、页脚、固定编号和装饰不计入':'短标签空间聚类，需结合缩略图复核一级模块',widthPt,heightPt};
}
export function colorName(hex){
 const [r,g,b]=String(hex).match(/../g)?.map(v=>parseInt(v,16))||[0,0,0],max=Math.max(r,g,b),min=Math.min(r,g,b);if(max-min<30)return max>210?'白':max<60?'黑':'灰';
 if(r>g*1.25&&r>b*1.25)return '红';if(b>r*1.15&&b>g*.95)return '蓝';if(g>r*1.1&&g>b*1.05)return '绿';if(r>170&&g>120&&b<150)return g>r*.72?'金':'橙';return r>b&&g>b?'橙':'其他';
}
const topics=[['党建',/党建|党委|党组织|党员/],['生产运营',/生产|工艺|产线|热轧/],['质量管理',/质量|缺陷|合格率/],['设备管理',/设备|故障|维护/],['安全环保',/安全|环保|能耗/],['人才培养',/人才|带教|培训|个人成长/],['技术研发',/技术|研发|模型|算法/],['数字化',/数字|平台|软件|系统架构/],['综合管理',/管理|组织|协同/]];
export function inferScenarios(title){return {reportTasks:unique([/总结|成果|业绩/.test(title)&&'工作总结',/计划|目标|下一步/.test(title)&&'工作计划',/项目|研发|流程|系统/.test(title)&&'项目汇报',/培训|学习|教学/.test(title)&&'培训授课',/科研|实验|研究/.test(title)&&'科研答辩']).concat('通用汇报'),businessTopics:topics.filter(([,re])=>re.test(title)).map(([label])=>label),basis:'源页标题语义；颜色不用于判定业务专用'};}
const cnNumber=s=>{if(/^\d+$/.test(s))return +s;const n={'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};if(s.includes('十')){const [t,u]=s.split('十');return (t?n[t]:1)*10+(n[u]||0);}return n[s]||null;};
export function parseMaterialQuery(query=''){
 const text=String(query),count=text.replace(/第\s*[一二两三四五六七八九十\d]+\s*(?:个|项|条|节点|模块|阶段)/g,'').match(/([一二两三四五六七八九十\d]+)\s*(?:个|项|条|节点|模块|阶段)/),chars=text.match(/每(?:项|条|个模块|模块)?\s*(\d+)\s*字/),colorText=(text.match(/红色|蓝色|金色|绿色|橙色|黑白|红白|蓝白|[红蓝金绿橙]{2,}/g)||[]).join('');
 const purpose=PAGE_PURPOSES.find(v=>text.includes(v))||(/成果|成效/.test(text)?'成果展示':/问题|不足/.test(text)?'现状问题':/方案|举措/.test(text)?'举措方案':undefined),logic=PAGE_LOGICS.find(v=>text.includes(v));
 return {query:text,purpose,logic,moduleCount:count?cnNumber(count[1]):undefined,perModuleChars:chars?+chars[1]:undefined,businessTopics:topics.filter(([,re])=>re.test(text)).map(([label])=>label),colors:unique(['红','蓝','金','绿','橙','黑白'].filter(v=>colorText.includes(v))),editable:/可编辑/.test(text.replace(/不可编辑|不要求可编辑|不需要可编辑|无需可编辑/g,''))?true:undefined};
}
export function slideTagRequirements(slide,requirements=''){
 const declared=slide.materialRequest||{},explicit=parseMaterialQuery(slide.title+' '+requirements),visual=({parallel:'并列',process:'流程',timeline:'时间',compare:'对比',hierarchy:'层级',architecture:'层级',cycle:'循环',hub:'关联',responsibility:'关联',matrix:'矩阵'})[slide.visual];
 return {...declared,...explicit,purpose:slide.kind==='cover'?'封面':slide.kind==='agenda'?'目录':slide.kind==='ending'?'结束页':explicit.purpose||declared.purpose,logic:explicit.logic||declared.logic||visual,moduleCount:explicit.moduleCount||declared.moduleCount||slide.bullets?.length||undefined,perModuleChars:explicit.perModuleChars||declared.perModuleChars,colors:explicit.colors.length?explicit.colors:declared.colors||[],editable:explicit.editable??declared.editable,businessTopics:unique([...(declared.businessTopics||[]),...explicit.businessTopics]),moduleCountExplicit:Boolean(explicit.moduleCount),source:'page-content-and-explicit-requirements'};
}
export function matchPageTags(card,request={}){
 if(!card)return {score:0,reasons:[],adjustments:['尚未建立单页标签'],usable:null};
 let score=0;const reasons=[],adjustments=[...(card.reuse?.adjustments||[])];
 if(request.purpose){if(card.purpose.main===request.purpose||card.purpose.secondary?.includes(request.purpose)){score+=16;reasons.push('用途：'+request.purpose);}else {score-=5;adjustments.push('用途需复核：原标注'+card.purpose.main+'，需求'+request.purpose);}}
 if(request.logic){if(card.logic.primary===request.logic||card.logic.secondary?.includes(request.logic)){score+=14;reasons.push('逻辑：'+request.logic);}else {score-=8;adjustments.push('表达逻辑不一致，需确认能否重排');}}
 if(request.moduleCount&&card.structure.moduleCount){const diff=Math.abs(request.moduleCount-card.structure.moduleCount);score+=diff===0?20:-Math.min(24,diff*7);if(!diff)reasons.push(card.structure.moduleCount+'个模块');else adjustments.push('模块数需核对：原页'+card.structure.moduleCount+'项，需求'+request.moduleCount+'项');}
 if(request.moduleCount&&!card.structure.moduleCount){score-=8;adjustments.push('模块数待核查，需确认能否承载'+request.moduleCount+'项内容');}
 if(request.perModuleChars){const ranges=card.capacity.modules.filter(m=>m.bodyCapacity?.max>0).map(m=>m.bodyCapacity),fit=ranges.length&&ranges.every(r=>r.max>=request.perModuleChars);score+=fit?15:-15;if(fit)reasons.push('各正文模块估计可容纳'+request.perModuleChars+'字');else adjustments.push('部分模块需压缩文字或换版');}
 if(request.businessTopics?.length){const overlap=request.businessTopics.filter(v=>card.scenario.businessTopics.includes(v));if(overlap.length){score+=6;reasons.push('场景：'+overlap.join('、'));}else if(!card.scenario.businessTopics.length)reasons.push('通用素材，可适配业务主题');}
 if(request.colors?.length){if(request.colors.some(c=>card.visual.colorNames.includes(c))){score+=9;reasons.push('原色：'+card.visual.colorNames.join('/'));}else {score-=12;adjustments.push('原配色与筛选颜色不一致，默认不改色');}}
 const editableMatch=card.editing.textEditable&&card.editing.graphicsEditable;if(request.editable&&!editableMatch){score-=25;adjustments.push('编辑能力不满足完整文字与图形编辑要求');}if(card.editing.imageObjects>0&&!card.editing.imageContentEditable)adjustments.push('图片内部内容不可直接编辑，需按需求换图');
 if(card.review?.status==='已视觉复核')adjustments.push('已逐图视觉复核；字数范围仍需结合实际填充检查');
 else if(card.review?.status!=='已人工复核')adjustments.push('自动标签与容量估算待复核');
 const ranges=card.capacity.modules.filter(m=>m.bodyCapacity?.max>0),capacityKnown=ranges.length>0&&ranges.length===card.capacity.modules.length,capacityFits=!request.perModuleChars||capacityKnown&&ranges.every(m=>m.bodyCapacity.max>=request.perModuleChars),structureFits=!request.moduleCount||request.moduleCount===card.structure.moduleCount;
 if(request.perModuleChars&&!capacityKnown)adjustments.push('正文容量待核查，不能保证每模块可容纳'+request.perModuleChars+'字');
 return {score,reasons,adjustments:unique(adjustments),usable:!card.reuse.generationReady?'暂不支持直接自动填充':request.moduleCount&&!card.structure.moduleCount?'模块数待核查，确认后使用':request.perModuleChars&&!capacityKnown?'正文容量待核查，确认后使用':!capacityFits?'需压缩文字或换版':!structureFits?'需重排模块或换版':!editableMatch?'仅部分对象可编辑，按限制复用':card.editing.imageObjects?'含可编辑文字图形，图片内容需另行替换':'可编辑复用；填充后仍需文字检查',capacityConfidence:card.capacity.confidence};
}
export function compactPageTags(card){return card?{pageId:card.id,purpose:card.purpose.main,logic:card.logic.primary,modules:card.structure.moduleCount,center:card.structure.centerCount,layout:card.structure.layout,bodyRanges:card.capacity.modules.slice(0,8).map(m=>[m.bodyCapacity.min,m.bodyCapacity.max]),capacityConfidence:card.capacity.confidence,colors:card.visual.colorNames,editable:{text:card.editing.textEditable,graphics:card.editing.graphicsEditable,data:card.editing.dataEditable},review:card.review.status}:undefined;}
export function materialTagsCsv(pages){
 const quote=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"',range=r=>r?.max>0?`${r.min}—${r.max}`:'待核查';
 const header=['素材编号','名称','源文件','源页','用途','辅助用途','逻辑','模块数','中心区数','布局','主标题建议字数','各模块正文容量','原正文总字符','原正文汉字数','原正文英文词数','全页建议正文','任务','业务主题','主色','字体','文字可编辑','图形可编辑','数据编辑','复用调整','套系','审核','容量可信度','授权状态','缩略图'];
 const rows=pages.map(p=>[p.id,p.name,p.sourceName,p.page,p.purpose.main,p.purpose.secondary.join('/'),p.logic.primary,p.structure.moduleCount??'待核查',p.structure.centerCount,p.structure.layout,range(p.capacity.title),p.capacity.modules.map(m=>m.id+':'+range(m.bodyCapacity)).join(';'),p.capacity.originalBody.characters,p.capacity.originalBody.chinese,p.capacity.originalBody.englishWords,range(p.capacity.bodyTotal),p.scenario.reportTasks.join('/'),p.scenario.businessTopics.join('/'),(p.visual.primaryColorNames||p.visual.colorNames).join('/'),p.visual.sourceFonts.join('/'),p.editing.textEditable,p.editing.graphicsEditable,p.editing.dataEditStatus||p.editing.dataEditable,p.reuse.adjustments.join('/'),p.visual.compatibleSeries,p.review.status,p.capacity.confidence,p.reuse.authorization,p.thumbnail]);return '\uFEFF'+[header,...rows].map(row=>row.map(quote).join(',')).join('\r\n');
}
