import {resolvePalette} from './material-palette.mjs';
import {RESEARCH_PROFILE} from './research-profile.mjs';
export async function applyDesignProfile(plan,baseTemplate){
 const palette=plan.palette||await resolvePalette({mode:plan.paletteMode||'material',sourceId:plan.paletteSourceId,userColors:plan.userColors},baseTemplate),academic=plan.designProfile==='research-defense';
 const template={...baseTemplate,designPalette:palette,theme:{...baseTemplate.theme,primary:palette.primary,secondary:palette.secondary,chartColors:palette.colors||[palette.primary,palette.secondary,palette.accent],text:palette.text||'202020',background:'FFFFFF'},institutionName:plan.institutionName||''};
 if(academic){template.width=Math.round(RESEARCH_PROFILE.canvas.widthCm*360000);template.height=Math.round(RESEARCH_PROFILE.canvas.heightCm*360000);template.fontPolicy=RESEARCH_PROFILE.fonts;template.theme.font=RESEARCH_PROFILE.fonts.body;template.safeArea={x:.75/33.87,y:.5/19.05,w:32.37/33.87,h:18/19.05};}
 return {template,palette};
}
