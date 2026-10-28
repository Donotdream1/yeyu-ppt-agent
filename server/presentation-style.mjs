import {readLibrary} from './library.mjs';
import {extractMaterialPalette,resolvePalette} from './material-palette.mjs';

export const STYLE_FAMILIES={research:'科研答辩',technical:'技术方案',business:'工作汇报',training:'培训教学','public-policy':'宣讲解读','data-report':'数据分析'};
export async function paletteCandidates(){
 const library=await readLibrary(),items=[];
 for(const source of library.sources.filter(s=>s.role!=='template'&&!/图标/.test(s.name))){const p=await extractMaterialPalette(source.id);items.push({sourceId:source.id,sourceName:source.name,colors:p.colors,primary:p.primary,accent:p.accent});}
 return items;
}
export async function decidePresentationStyle(proposal,input,template){
 if(!STYLE_FAMILIES[proposal.family])throw Error('请从已支持的文档风格类别中选择');
 const evidence=proposal.evidence||[];if(!evidence.some(q=>typeof q==='string'&&q.length>=4&&input.document.includes(q)))throw Error('风格判断需要至少一段真实文档摘录作为依据');
 const explicit=input.designProfile&&input.designProfile!=='auto',profile=explicit?input.designProfile:template.bnaProfile?'material':proposal.family==='research'?'research-defense':'material';
 const palette=await resolvePalette({mode:input.paletteMode||'material',sourceId:input.paletteSourceId||proposal.paletteSourceId,userColors:input.userColors},template);

 return {family:proposal.family,familyName:STYLE_FAMILIES[proposal.family],profile,profileReason:explicit?'采用用户明确指定的版式规范':template.bnaProfile?'保留用户指定的BNA模板结构':'根据文档性质选择版式规范',rationale:String(proposal.rationale||'按文档内容和用途判断').slice(0,600),evidence,audience:input.audience||'',palette,paletteReason:input.paletteMode==='user'?'用户明确指定的颜色':input.paletteSourceId?'用户明确选定的配色素材':String(proposal.paletteReason||'从适合该文档用途的素材中选取已有配色').slice(0,400),decisionSource:explicit?'document-analysis-with-user-override':'document-analysis'};
}
