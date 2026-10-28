import {navigationPolicy} from './navigation-sections.mjs';
const withoutNumber=title=>String(title||'').replace(/^\s*(?:\d+\.\d+\s+|[一二三四五六七八九十]+[、.．])\s*/,'').trim();
export function headlineIssues(plan){
 return (plan.slides||[]).flatMap((slide,i)=>{
  const title=withoutNumber(slide.title),length=Array.from(title).length,limit=/[\u3400-\u9fff]/.test(title)?24:60;
  if(['agenda','ending'].includes(slide.kind))return [];
  return length>limit?[{page:i+1,field:'title',actual:length,limit,issue:`第${i+1}页标题${length}字，最多${limit}字（不含编号）；请概括一个核心意思，将背景、细节与第二个观点放入正文，不要机械截断。`}]:[];
 });
}
export function createPresentationContract(plan,template,input={}){
 return {version:'1.2',units:{font:'pt',geometry:'EMU',emuPerPt:12700,pxToPt:.75},canvas:{width:template.width,height:template.height},templateId:template.id,navigation:{...navigationPolicy(template),sections:[...(plan.sections||[])],source:'document-outline',fontSizePt:20,fontFamily:'微软雅黑'},fonts:{family:input.styleSkillSnapshot?.fontFamily||plan.styleSkillSnapshot?.fontFamily||template.fontPolicy?.body||'微软雅黑',navigationPt:20,sourceSize:'preferred',explicitModuleSizePt:[14,32],autoShrink:false},palette:{mode:input.paletteMode||'material',sourceId:plan.palette?.sourceId||input.paletteSourceId||'',preserveSourceColors:!input.paletteMode||input.paletteMode==='material'},titles:{chineseLimit:24,englishLimit:60,oneMessage:true,detailInBody:true},nativeObjects:true,sourceFactsOnly:true,review:{contentRelevance:true,nativeMeasurement:true,renderedPreview:true,visualVerdictRequiresEvidence:true}};
}
