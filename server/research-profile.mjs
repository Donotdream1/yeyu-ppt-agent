export const RESEARCH_PROFILE={
 id:'research-defense',name:'科研答辩 · 紧凑参考版式',canvas:{widthCm:33.87,heightCm:19.05},marginCm:.75,
 fonts:{title:'微软雅黑',body:'黑体',latin:'Arial'},sizes:{chapter:32,title:32,section:21,module:17,viewpoint:16,body:14,supplement:12,figureCaption:14,tableHeader:14,tableBody:13,axis:11,conclusion:15,page:10},
 areasCm:{header:{y:.5,h:1.3},viewpoint:{y:2.3,h:1.5},bar:{y:4.05,h:1.2},body:{y:5.5,h:11.4},conclusion:{y:17.2,h:1.3}},
 lineWidthPt:.65,arrowWidthPt:.85,lineSpacing:1.15,background:'FFFFFF',shapes:'right-angle',
 layouts:['technical-route','comparison','architecture','cycle'],
 colorsPolicy:'明确用户配色优先；否则选定素材的原始主题色与显式颜色。不得自行混色。',
 suggestedColors:{primary:'164C78',bar:'1044A4',surface:'EDF2FC',border:'B8C0C6',text:'202020',muted:'666666',accent:'B54A50'},
 referenceStatus:'文字规范已提供；本轮未附参考图片，不声称精确复刻原始母版。'
};
export function researchStyle(palette){return {...RESEARCH_PROFILE,colors:{...RESEARCH_PROFILE.suggestedColors,...palette,primary:palette.primary,bar:palette.bar||palette.primary,surface:palette.surface||'FFFFFF',background:'FFFFFF'},paletteProvenance:palette.provenance};}
export function researchPageErrors(slide,sourceText=''){
 const r=slide.research||{},errors=[];
 if(!RESEARCH_PROFILE.layouts.includes(r.layout))errors.push('需要 technical-route、comparison、architecture 或 cycle 版式');
 for(const name of ['viewpoint','contentTitle','conclusion'])if(typeof r[name]!=='string'||!r[name].trim())errors.push('缺少 '+name);
 if(!Array.isArray(r.conclusionEvidence)||!r.conclusionEvidence.some(q=>typeof q==='string'&&q.length>=6&&sourceText.includes(q)))errors.push('conclusionEvidence 需要原文逐字摘录，结论不能无依据');
 if(Array.from(slide.title).reduce((n,c)=>n+(/[\u2e80-\uff60]/.test(c)?1:.55),0)>22)errors.push('主标题过长，请压缩到约22个汉字宽以内以保持32pt层级');
 if(r.layout==='technical-route'){if(!Array.isArray(r.modules)||!r.modules.length)errors.push('技术路线请用 modules 表示各行，每行 {title,steps:[{title,body}],notes}；layers 仅用于分层架构');if(r.modules?.length>4)errors.push('技术路线最多4行，请精简或拆页，不会静默截断');for(const m of r.modules||[])if(m.steps?.length>3)errors.push('技术路线每行最多3个步骤，请精简或拆页');}
 if(r.layout==='comparison'&&r.evidence?.length>4)errors.push('对比页最多4组证据，请精简或拆页，不会静默截断');
 if(r.layout==='comparison'&&(!r.table?.rows?.length||r.table.headers?.length!==4))errors.push('对比页需要四列表格和真实比较内容');
 if(r.layout==='cycle'&&(r.modules?.length!==4||!r.cycleEvidence||!sourceText.includes(r.cycleEvidence)))errors.push('四环节循环需要四个真实环节及原文循环关系依据');
 return errors;
}
