import {applyBindingStyle,centerLabelOnContainer,fitTwoLineLabel} from './binding-style.mjs';
import {applyNativeEditsToDocument} from './native-page-editor.mjs';
import {balancedLabelText} from './material-semantics.mjs';
import {replaceExamplePhotos} from './source-photos.mjs';
import {cleanBnaMasterExamples,fillBnaCover,layoutBnaContent,removeCoverTemplateNotice} from './bna-template.mjs';
import {navigationSections} from './navigation-sections.mjs';
import {applyPageChrome} from './page-chrome.mjs';
import {composeResearchSlide} from './research-layout.mjs';
import {primitiveShape,styleNativeText,nativeTable} from './native-primitives.mjs';
import {preserveIconAspect} from './native-reflow.mjs';
import {composeHermesSlide} from './page-layout.mjs';
import {harmonizeNative,harmonizedText,designSystem} from './design-system.mjs';
import {normalizeDeckFonts,PPT_FONT,applyTextColor,fitMaterialText,replaceTextPreservingStyles,preventTextAutofit,uniformLabelFontSize} from './typography.mjs';
import {slotKey} from './material-analysis.mjs';
import {isDecorativeSourceSlot,removeSourceDecorations} from './source-captions.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {openZip,parse,serialize,elements,first,NS,esc,relPath,resolvePart,textShape,setShapeText,slideOrder} from './ooxml.mjs';
import {sourceBuffer} from './library.mjs';
import {direct,drawingNodes,textNodes,componentNodes} from './components.mjs';
import {bindReferencePageCharts} from './reference-charts.mjs';
import {bindNativeChart} from './native-charts.mjs';
import {editableTextTargets,rankMaterialLayouts,fallbackBindings} from './material-layouts.mjs';
import {readSourceTheme,freezeSourceTheme,readSourceTypography,freezeSourceFontSizes,scaleNativeTables} from './source-theme.mjs';

const relNS=NS.rel;
const descendants=n=>[n,...Array.from(n.getElementsByTagName('*'))];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const textOf=s=>elements(first(s,'txBody'),'t').map(t=>t.textContent).join('');
function cleanLabel(text){return text.split(/[：:。；]/)[0].slice(0,14);}
export function autoCompose(plan,template,components){
  const used=new Set();
  const candidates=components.filter(c=>['icon','shape'].includes(c.type)&&!c.dataRisk&&c.autoUse!==false&&c.bounds.w/c.bounds.h>.35&&c.bounds.w/c.bounds.h<2.8);
  function selectIcon(text,i){const words=text.match(/[\u4e00-\u9fff]{2}|[A-Za-z]{3,}/g)||[];const ranked=candidates.map((c,index)=>({c,score:words.filter(w=>[c.title,...c.tags].join(' ').includes(w)).length*20+(c.reviewed?12:0)+(c.type==='icon'?5:0)+(/图标|icon/i.test(c.sourceName)?10:0)-(used.has(c.id)?4:0),index})).sort((a,b)=>b.score-a.score||a.index-b.index);const pool=ranked.filter(r=>r.score===ranked[0]?.score);const chosen=pool[i%Math.max(1,pool.length)]?.c;if(chosen){used.add(chosen.id);if(chosen.familyId)used.add(chosen.familyId);}return chosen;}
  const defaultDensity=plan.layoutDensity||'full';
  const result={...plan,layoutDensity:defaultDensity,templateId:template.id,canvas:{width:template.width,height:template.height},slides:plan.slides.map((slide,page)=>{
    if(plan.designProfile==='research-defense'){const native=slide.chart?.status==='ready'?components.find(c=>c.id===slide.materialId&&c.type==='chart'):null;return composeResearchSlide({...slide,researchChartSnapshot:native},page,template);}
    if((plan.workflow==='hermes'||slide.stylePolicy==='harmonized')&&slide.materialSnapshot&&!slide.chart){const arranged=composeHermesSlide(slide,page,template);if(arranged)return arranged;}
    const density=slide.layoutDensity||defaultDensity;
    const blocks=[],area=template.safeArea||{x:.055,y:.16,w:.89,h:.76};
    const visual=slide.visual||(['process'].includes(slide.kind)?'process':'parallel');
    const add=b=>{const block={id:`p${page+1}-b${blocks.length+1}`,...b};blocks.push(block);return block;};
    const chosen=slide.materialSnapshot||components.find(c=>c.layout&&c.id===slide.materialId)||(!slide.chart?rankMaterialLayouts(slide,components,{referenceId:plan.referenceId,used,materialScope:plan.materialScope||'full'})[0]?.component:null);
    if(chosen){used.add(chosen.id);if(chosen.familyId)used.add(chosen.familyId);}
    const basePage=slide.templatePage||Math.min(page===0?1:slide.kind==='ending'?template.pages.length:Math.min(2,template.pages.length),template.pages.length);
    if(chosen&&slide.kind==='cover'){
      add({type:'component',componentId:chosen.id,materialSnapshot:chosen,x:area.x,y:area.y,w:area.w,h:area.h,bindText:true,textBindings:slide.materialBindings||fallbackBindings(slide,chosen),colorMode:'source'});
    }else if(slide.kind==='cover'){
      add({type:'text',role:'title',text:slide.title,x:area.x+.025,y:area.y+.2,w:area.w-.05,h:.18,fontSize:40});
      add({type:'text',role:'subtitle',text:slide.subtitle||'',x:area.x+.03,y:area.y+.42,w:area.w-.06,h:.13,fontSize:21});
    }else{
      const inlineSubtitle=density==='full'&&slide.title.length<=18&&slide.subtitle?.length<=22;
      add({type:'text',role:'title',text:slide.title,x:area.x,y:area.y,w:inlineSubtitle?area.w*.66:area.w,h:density==='full'?.075:.105,fontSize:density==='full'?28:30});
      if(slide.subtitle)add({type:'text',role:'subtitle',text:slide.subtitle,x:inlineSubtitle?area.x+area.w*.68:area.x,y:area.y+(inlineSubtitle ? .018 : density==='full' ? .078 : .11),w:inlineSubtitle?area.w*.32:area.w,h:density==='full' ? .045 : .06,fontSize:inlineSubtitle?11:density==='full'?12:14});
      const top=area.y+(density==='full'?(slide.subtitle?.trim()?.length&&!inlineSubtitle ? .13 : .095):density==='spacious' ? .2 : slide.subtitle?.trim()?.length ? .17 : .145),height=area.y+area.h-top;
      const bullets=slide.bullets.filter(Boolean),n=Math.max(1,bullets.length);
      const diagrams=components.filter(c=>c.type==='diagram'&&!c.dataRisk&&c.relation===visual&&c.textSlots===n&&n>=2&&n<=8);
      const diagram=diagrams.find(c=>[...c.tags,c.title].some(t=>(slide.visualKeywords||[]).some(w=>t.includes(w))));
      if(slide.chart){const wanted=['S01','S02','S03'].includes(slide.chart.code)?'barChart':slide.chart.code==='S04'?'pieChart':slide.chart.code==='S05'?'lineChart':null;const native=slide.chart.status==='ready'&&wanted?(components.find(c=>c.id===slide.materialId&&c.type==='chart'&&c.chartKinds?.length===1&&c.chartKinds[0]===wanted&&(wanted!=='barChart'||c.chartDirection==='col'))||components.find(c=>c.type==='chart'&&c.chartKinds?.length===1&&c.chartKinds[0]===wanted&&(wanted!=='barChart'||c.chartDirection==='col'))):null;if(native){add({type:'text',role:'chart-unit',text:'单位：'+slide.chart.unit,x:area.x,y:top,w:area.w,h:.045,fontSize:12});add({type:'component',componentId:native.id,chart:slide.chart,bindData:true,bindText:false,colorMode:'source',x:area.x,y:top,w:area.w,h:height});}else add({type:'chart',chart:slide.chart,x:area.x,y:top,w:area.w,h:height});}
      else if(chosen){add({type:'component',componentId:chosen.id,materialSnapshot:chosen,x:area.x,y:top,w:area.w,h:height,bindText:true,textBindings:slide.materialBindings||fallbackBindings(slide,chosen),colorMode:'source'});}
      else if(diagram){add({type:'component',componentId:diagram.id,x:area.x,y:top,w:area.w,h:height,bindText:true,textMap:bullets,colorMode:'template'});}
      else{
        let cols=visual==='process'?Math.min(4,n):visual==='compare'?2:n<=3?n:2;
        if(visual==='text')cols=1;
        const rows=Math.ceil(n/cols),gapX=.035,gapY=.035,defaultW=(area.w-gapX*(cols-1))/cols,defaultH=(height-gapY*(rows-1))/rows;
        const iconBlocks=[];
        for(let i=0;i<n;i++){
          const text=bullets[i]||'',row=Math.floor(i/cols),col=i%cols;
          let cellW=defaultW,cellH=defaultH,x=area.x+col*(cellW+gapX),y=top+row*(cellH+gapY);
          if(visual==='hierarchy'&&n>1){if(i===0){cellW=area.w*.5;cellH=height*.34;x=area.x+(area.w-cellW)/2;y=top;}else{const childCols=Math.min(3,n-1),childRows=Math.ceil((n-1)/childCols);cellW=(area.w-gapX*(childCols-1))/childCols;cellH=(height*.58-gapY*(childRows-1))/childRows;x=area.x+((i-1)%childCols)*(cellW+gapX);y=top+height*.42+Math.floor((i-1)/childCols)*(cellH+gapY);}}
          if(visual==='cycle'&&n>1){cellW=area.w*(n<=4?.3:.22);cellH=height*(n<=4?.33:.24);const angle=-Math.PI/2+i*Math.PI*2/n;x=area.x+area.w/2+Math.cos(angle)*(area.w-cellW)/2-cellW/2;y=top+height/2+Math.sin(angle)*(height-cellH)/2-cellH/2;}
          const icon=selectIcon([text,...(slide.visualKeywords||[])].join(' '),i+page*3),size=Math.min(.085,cellW*.36,cellH*.25/(template.width/template.height));
          if(icon&&visual!=='text')iconBlocks.push(add({type:'component',componentId:icon.id,x,y:y+cellH*.03,w:size,h:size*template.width/template.height,bindText:false,colorMode:'template'}));
          const iconH=icon&&visual!=='text'?size*template.width/template.height+cellH*.09:0;
          const label=cleanLabel(text),detail=text.includes('：')?text.slice(text.indexOf('：')+1):text;
          if(visual==='process')add({type:'text',role:'label',text:String(i+1).padStart(2,'0'),x:x+Math.min(.11,cellW*.6),y:y+.025,w:cellW*.4,h:.06,fontSize:14});
          add({type:'text',role:'label',text:label,x,y:y+iconH,w:cellW,h:Math.min(.12,cellH*.24),fontSize:cellH<.22?16:cols>=4?17:21});
          if(detail!==label)add({type:'text',role:'body',text:detail,x,y:y+iconH+Math.min(.12,cellH*.24),w:cellW,h:Math.max(.035,cellH-iconH-Math.min(.12,cellH*.24)),fontSize:cellH<.22?13:cols>=4?15:18});
        }
        if(visual==='process')for(let i=0;i<iconBlocks.length-1;i++){const a=iconBlocks[i],b=iconBlocks[i+1];if(Math.abs(a.y-b.y)<.01)add({type:'connector',from:a.id,to:b.id,x:a.x+a.w+.012,y:a.y+a.h/2,w:Math.max(.01,b.x-a.x-a.w-.028),h:0});}
      }
    }
    return {...slide,layoutDensity:density,visual,templatePage:basePage,blocks,...(plan.workflow==='hermes'&&slide.chart?{layoutReview:{recipe:'native-chart',font:'微软雅黑',sourceObjects:blocks.filter(b=>b.type==='component').reduce((n,b)=>n+(components.find(c=>c.id===b.componentId)?.nativeObjects||0),0),retainedObjects:blocks.filter(b=>b.type==='component').reduce((n,b)=>n+(components.find(c=>c.id===b.componentId)?.nativeObjects||0),0),chartStatus:slide.chart.status}}:{})};
  })};
  return result;
}

function groupRoot(doc,id,bounds,box,name){
  const node=parse(`<p:grpSp xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:nvGrpSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.w}" cy="${box.h}"/><a:chOff x="${Math.round(bounds.x)}" y="${Math.round(bounds.y)}"/><a:chExt cx="${Math.max(1,Math.round(bounds.w))}" cy="${Math.max(1,Math.round(bounds.h))}"/></a:xfrm></p:grpSpPr></p:grpSp>`).documentElement;
  return doc.importNode(node,true);
}
function fitBox(block,component,template){const b={x:Math.round(block.x*template.width),y:Math.round(block.y*template.height),w:Math.round(block.w*template.width),h:Math.round(block.h*template.height)};if(block.fitMode==='fill')return b;const scale=Math.min(b.w/component.bounds.w,b.h/component.bounds.h),w=Math.round(component.bounds.w*scale),h=Math.round(component.bounds.h*scale);return {x:b.x+Math.round((b.w-w)/2),y:b.y+Math.round((b.h-h)/2),w,h};}
function recolor(node,template,mode){if(mode==='source'||mode==='harmonized')return;for(const color of elements(node,'srgbClr')){const v=color.getAttribute('val');if(!/^(FFFFFF|000000|F[0-9A-F]{5}|E[0-9A-F]{5})$/i.test(v)&&v?.length===6)color.setAttribute('val',template.theme.primary);else if(v==='000000'&&!color.parentNode?.parentNode?.localName?.includes('rPr'))color.setAttribute('val',template.theme.primary);}for(const name of ['latin','ea'])for(const font of elements(node,name))font.setAttribute('typeface',template.theme.font);}
export async function composeDeck(plan,template,components,{loadSource=sourceBuffer,chartRenderer}={}){
  const zip=await openZip(await loadSource(template.sourceId)),typesDoc=parse(await zip.file('[Content_Types].xml').async('string'));
  const pdoc=parse(await zip.file('ppt/presentation.xml').async('string')),prels=parse(await zip.file('ppt/_rels/presentation.xml.rels').async('string'));
  const originalOrder=await slideOrder(zip),warnings=[],charts=[],audit=[],chromeChanges=[];
  const override=(part,type)=>{let n=elements(typesDoc,'Override').find(n=>n.getAttribute('PartName')==='/'+part);if(!n){n=typesDoc.createElementNS('http://schemas.openxmlformats.org/package/2006/content-types','Override');typesDoc.documentElement.appendChild(n);}n.setAttribute('PartName','/'+part);n.setAttribute('ContentType',type);};
  for(const node of elements(prels,'Relationship'))if(node.getAttribute('Type')===NS.r+'/slide')node.parentNode.removeChild(node);
  for(const key of ['sldIdLst','custShowLst','extLst']){const n=direct(pdoc.documentElement,key);if(n)n.parentNode.removeChild(n);}
  const slideList=pdoc.createElementNS(NS.p,'p:sldIdLst');const size=direct(pdoc.documentElement,'sldSz');pdoc.documentElement.insertBefore(slideList,size||null);
  const sourceCache=new Map();
  async function source(id){if(sourceCache.has(id))return sourceCache.get(id);const src=await openZip(await loadSource(id)),prefix=`ppt/component-resources/${id}/`;const ct=parse(await src.file('[Content_Types].xml').async('string'));
    for(const n of elements(ct,'Default'))if(!elements(typesDoc,'Default').some(v=>v.getAttribute('Extension')===n.getAttribute('Extension')))typesDoc.documentElement.insertBefore(typesDoc.importNode(n,true),typesDoc.documentElement.firstChild);
    const sourceTypes=new Map(elements(ct,'Override').map(n=>[n.getAttribute('PartName').slice(1),n.getAttribute('ContentType')])),copied=new Set();
    const state={src,prefix,pages:new Map(),async copy(name,instance=''){const targetPrefix=prefix+(instance?'instances/'+instance.replace(/[^a-z0-9_-]/gi,'_')+'/':'');const targetPart=targetPrefix+name;if(copied.has(targetPart))return targetPart;copied.add(targetPart);const f=src.file(name);if(!f)throw new Error('元素缺少资源：'+name);zip.file(targetPart,await f.async('nodebuffer'));if(sourceTypes.has(name))override(targetPart,sourceTypes.get(name));const rf=src.file(relPath(name));if(rf){const d=parse(await rf.async('string'));for(const n of elements(d,'Relationship')){if(n.getAttribute('TargetMode')==='External')continue;const t=n.getAttribute('Target');const copiedTarget=await state.copy(resolvePart(name,t),instance);n.setAttribute('Target',path.posix.relative(path.posix.dirname(targetPart),copiedTarget));}zip.file(relPath(targetPart),serialize(d));}return targetPart;}};sourceCache.set(id,state);return state;
  }
  let notesMaster=elements(prels,'Relationship').find(n=>n.getAttribute('Type')===NS.r+'/notesMaster');
  if(!notesMaster){const base=await openZip(await fs.readFile(new URL('./base.pptx',import.meta.url))),part='ppt/notesMasters/composedNotesMaster.xml';zip.file(part,await base.file('ppt/notesMasters/notesMaster1.xml').async('nodebuffer'));const themePart=Object.keys(zip.files).find(n=>/^ppt\/theme\/.*\.xml$/.test(n));zip.file(relPath(part),`<Relationships xmlns="${relNS}"><Relationship Id="rId1" Type="${NS.r}/theme" Target="${path.posix.relative(path.posix.dirname(part),themePart)}"/></Relationships>`);override(part,'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml');notesMaster=prels.createElementNS(relNS,'Relationship');notesMaster.setAttribute('Id','rIdComposedNotesMaster');notesMaster.setAttribute('Type',NS.r+'/notesMaster');notesMaster.setAttribute('Target','notesMasters/composedNotesMaster.xml');prels.documentElement.appendChild(notesMaster);let list=direct(pdoc.documentElement,'notesMasterIdLst');if(!list){list=pdoc.createElementNS(NS.p,'p:notesMasterIdLst');pdoc.documentElement.insertBefore(list,slideList);}const id=pdoc.createElementNS(NS.p,'p:notesMasterId');id.setAttributeNS(NS.r,'r:id','rIdComposedNotesMaster');list.appendChild(id);}
  async function importEndingPage(c,templatePart,page){
    const state=await source(c.sourceId),part=`ppt/slides/native-ending-source-${page+1}.xml`,doc=parse(await state.src.file(c.part).async('string'));
    if(!c.nativeReference)doc.documentElement.setAttribute('showMasterSp','0');
    const rels=parse(await state.src.file(relPath(c.part)).async('string'));
    for(const rel of [...elements(rels,'Relationship')]){
      if((!c.nativeReference&&rel.getAttribute('Type').endsWith('/slideLayout'))||/\/(notesSlide|comments|commentAuthors)$/.test(rel.getAttribute('Type'))){rel.parentNode.removeChild(rel);continue;}
      if(rel.getAttribute('TargetMode')!=='External'){const copied=await state.copy(resolvePart(c.part,rel.getAttribute('Target')),`ending-${page+1}`);rel.setAttribute('Target',path.posix.relative(path.posix.dirname(part),copied));}
    }
    const base=parse(await zip.file(relPath(templatePart)).async('string')),layout=elements(base,'Relationship').find(r=>r.getAttribute('Type')===NS.r+'/slideLayout');
    if(layout&&!c.nativeReference){const rel=rels.createElementNS(relNS,'Relationship');rel.setAttribute('Id','rIdEndingBaseLayout');rel.setAttribute('Type',NS.r+'/slideLayout');rel.setAttribute('Target',path.posix.relative(path.posix.dirname(part),resolvePart(templatePart,layout.getAttribute('Target'))));rels.documentElement.appendChild(rel);}
    const cs=first(doc,'cSld');
    if(!direct(cs,'bg')){
      let sourcePart=c.part,bg=null;
      for(let depth=0;depth<3&&!bg;depth++){const d=parse(await state.src.file(sourcePart).async('string'));bg=first(d,'bg');if(bg)break;const rf=state.src.file(relPath(sourcePart));if(!rf)break;const rel=elements(parse(await rf.async('string')),'Relationship').find(r=>/\/(slideLayout|slideMaster)$/.test(r.getAttribute('Type')));if(!rel)break;sourcePart=resolvePart(sourcePart,rel.getAttribute('Target'));}
      if(bg)cs.insertBefore(doc.importNode(bg,true),cs.firstChild);
      else cs.insertBefore(doc.importNode(parse(`<p:bg xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg>`).documentElement,true),cs.firstChild);
    }
    zip.file(part,serialize(doc));zip.file(relPath(part),serialize(rels));return part;
  }
  const bnaEnabled=Boolean(template.bnaProfile&&plan.designProfile!=='research-defense');
  if(bnaEnabled)await cleanBnaMasterExamples(zip,template.bnaProfile.sections||[]);
  for(let page=0;page<plan.slides.length;page++){
    const slide=plan.slides[page],fullEnding=Boolean(slide.materialSnapshot?.sourceFullPage&&(slide.kind==='ending'||slide.materialSnapshot.nativeReference)),bnaCover=Boolean(bnaEnabled&&page===0&&slide.kind==='cover'),templateIndex=clamp(((bnaEnabled?(bnaCover?template.bnaProfile.coverPage:template.bnaProfile.contentPage):slide.templatePage)||1)-1,0,originalOrder.paths.length-1),baseTemplatePart=originalOrder.paths[templateIndex],part=`ppt/slides/composed-${page+1}.xml`;
    const endingSource=fullEnding?await source(slide.materialSnapshot.sourceId):null,templatePart=fullEnding&&slide.materialSnapshot.nativeReference&&slide.materialSnapshot.sourceId===template.sourceId?baseTemplatePart:fullEnding?await importEndingPage(slide.materialSnapshot,baseTemplatePart,page):baseTemplatePart;
    if(fullEnding&&slide.materialSnapshot.nativeReference&&templatePart===baseTemplatePart){const nativeRels=parse(await zip.file(relPath(templatePart)).async('string'));for(const r of elements(nativeRels,'Relationship').filter(r=>r.getAttribute('Type').endsWith('/chart'))){const copied=await endingSource.copy(resolvePart(templatePart,r.getAttribute('Target')),'native-page-'+(page+1));r.setAttribute('Target',path.posix.relative(path.posix.dirname(templatePart),copied));}zip.file(relPath(templatePart),serialize(nativeRels));}
    const doc=parse(await zip.file(templatePart).async('string')),tree=first(doc,'spTree');
    if(fullEnding){
      const c=slide.materialSnapshot,typo=await readSourceTypography(endingSource.src,c.part),theme=await readSourceTheme(endingSource.src,c.part),textTargets=[];
      freezeSourceFontSizes(doc,typo);freezeSourceTheme(doc,theme);
      for(const node of drawingNodes(doc).flatMap(n=>editableTextTargets(n))){
        const key=slotKey(node),slot=c.slots.find(s=>s.key===key),binding=slide.materialBindings?.find(b=>b.key===key||b.slot===slot?.index);
        if(!slot)continue;
        const text=slot.decorative?'':binding?.text||'';replaceTextPreservingStyles(doc,node,text);
        if(binding?.style)applyBindingStyle(node,binding.style);
        textTargets.push({key,slot:slot.index,shapeId:Number(first(node,'cNvPr')?.getAttribute('id')||key.split(':')[1]),...(node.localName==='tc'?{row:Number(key.split(':')[2])+1,column:Number(key.split(':')[3])+1}:{}),sourceFontSizesPt:slot.sourceFontSizesPt,preserveSourceFontSize:true,requestedTypography:binding?.style});
      }
      if(c.nativeReference)await bindReferencePageCharts(zip,templatePart,c.chartData||[],override,charts,page+1);
      const count=elements(doc,'cNvPr').length-1;audit.push({page:page+1,componentId:c.id,source:c.sourceName,sourcePage:c.page,native:true,fullSourcePage:true,nativeObjectCount:count,sourceNativeObjects:count,textTargets});
    }
    if(bnaEnabled&&!bnaCover&&!fullEnding)for(const node of drawingNodes(doc))node.parentNode.removeChild(node);
    if(bnaCover)fillBnaCover(doc,plan,template.bnaProfile,template);
    if(slide.kind==='cover')removeCoverTemplateNotice(doc);
    if(!bnaCover&&!fullEnding&&slide.clearTemplateText!==false)for(const node of elements(tree,'sp').filter(n=>first(n,'txBody')))replaceTextPreservingStyles(doc,node,'');
    const relsFile=zip.file(relPath(templatePart));const rels=relsFile?parse(await relsFile.async('string')):parse(`<Relationships xmlns="${relNS}"/>`);
    // A slide's theme override is a private part. Cloning the slide must clone this part too.
    // Sharing it between newly composed slides makes PowerPoint reject multi-slide files.
    for(const r of elements(rels,'Relationship').filter(r=>r.getAttribute('Type').endsWith('/themeOverride'))){
      const original=resolvePart(templatePart,r.getAttribute('Target')),copy=`ppt/theme/composedThemeOverride-${page+1}.xml`;
      zip.file(copy,await zip.file(original).async('nodebuffer'));
      if(zip.file(relPath(original)))zip.file(relPath(copy),await zip.file(relPath(original)).async('nodebuffer'));
      override(copy,'application/vnd.openxmlformats-officedocument.themeOverride+xml');
      r.setAttribute('Target',path.posix.relative(path.posix.dirname(templatePart),copy));
    }
    for(const r of elements(rels,'Relationship')){if(/\/(notesSlide|comments|commentAuthors)$/.test(r.getAttribute('Type'))){r.parentNode.removeChild(r);continue;}if(r.getAttribute('TargetMode')!=='External')r.setAttribute('Target',path.posix.relative(path.posix.dirname(part),resolvePart(templatePart,r.getAttribute('Target'))));}
    let nextId=Math.max(1,...elements(doc,'cNvPr').map(n=>+n.getAttribute('id')))+1,relIndex=Math.max(0,...elements(rels,'Relationship').map(n=>Number(n.getAttribute('Id').replace(/^rId/,''))||0))+1;
    if(!fullEnding&&plan.designProfile==='research-defense'){doc.documentElement.setAttribute('showMasterSp','0');for(const old of drawingNodes(doc))old.parentNode.removeChild(old);const cs=first(doc,'cSld');let bg=direct(cs,'bg');if(bg)bg.parentNode.removeChild(bg);bg=parse(`<p:bg xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`).documentElement;cs.insertBefore(doc.importNode(bg,true),cs.firstChild);}
    const groupIds=new Map();
    for(const block of bnaCover||fullEnding?[]:slide.blocks||[]){
      if(block.type==='shape'){tree.appendChild(primitiveShape(doc,nextId++,block,template));
      }else if(block.type==='table'){tree.appendChild(nativeTable(doc,nextId++,block,template));
      }else if(block.type==='text'){
        const role=block.role||'body',color=slide.stylePolicy==='harmonized'?(role==='title'||role==='label'?designSystem(template).primary:designSystem(template).text):(role==='title'||role==='label'?template.theme.primary:template.theme.text);
        const node=parse(`<root xmlns:p="${NS.p}" xmlns:a="${NS.a}">${textShape(nextId++,block.text||'',Math.round(block.x*template.width),Math.round(block.y*template.height),Math.round(block.w*template.width),Math.round(block.h*template.height),block.fontSize||20,block.textColor||color,block.bold??(role==='title'||role==='label'))}</root>`).documentElement.firstChild;
        const imported=doc.importNode(node,true);for(const name of ['latin','ea'])for(const n of elements(imported,name))n.setAttribute('typeface',template.theme.font);replaceTextPreservingStyles(doc,imported,block.text||'');if(plan.designProfile==='research-defense')styleNativeText(imported,block,{academic:true});tree.appendChild(imported);
      }else if(block.type==='component'){
        if(block.bindData&&block.chart?.status!=='ready'&&chartRenderer){const blocked=await chartRenderer(block.chart,template,block,nextId);nextId=blocked.nextId;if(blocked.node)tree.appendChild(doc.importNode(blocked.node,true));if(blocked.files)charts.push({page:page+1,...blocked.files});warnings.push(...(blocked.warnings||[]).map(w=>`第 ${page+1} 页：${w}`));continue;}
        const component=block.materialSnapshot||components.find(c=>c.id===block.componentId);if(!component)throw new Error('页面使用的元素不存在，请重新匹配');
        const src=await source(component.sourceId);let sourceDoc=src.pages.get(component.part);if(!sourceDoc){sourceDoc=parse(await src.src.file(component.part).async('string'));src.pages.set(component.part,sourceDoc);}
        const targetKeys=new WeakMap(),sourceTypography=await readSourceTypography(src.src,component.part);
        const group=groupRoot(doc,nextId++,component.bounds,fitBox(block,component,template),component.title),idMap=new Map();groupIds.set(block.id,first(group,'cNvPr').getAttribute('id'));
        for(const attr of Array.from(sourceDoc.documentElement.attributes))if(attr.name.startsWith('xmlns:')&&!['xmlns:p','xmlns:a','xmlns:r'].includes(attr.name))group.setAttributeNS('http://www.w3.org/2000/xmlns/',attr.name,attr.value);
        const selectedSourceNodes=componentNodes(sourceDoc,component);if(selectedSourceNodes.some(n=>!n))throw new Error('素材结构已变化，请重新索引');
        for(const originalNode of removeSourceDecorations(selectedSourceNodes.map(n=>n.cloneNode(true)),component.suppressedSourceIds)){const node=doc.importNode(originalNode,true);freezeSourceFontSizes(node,sourceTypography);for(const target of editableTextTargets(node,{legacy:component.slotPolicy==='legacy'}))targetKeys.set(target,slotKey(target));for(const c of elements(node,'cNvPr')){const old=c.getAttribute('id'),id=String(nextId++);idMap.set(old,id);c.setAttribute('id',id);}for(const ph of elements(node,'ph'))ph.parentNode.removeChild(ph);group.appendChild(node);}
        for(const key of ['stCxn','endCxn'])for(const c of elements(group,key)){const replacement=idMap.get(c.getAttribute('id'));if(replacement)c.setAttribute('id',replacement);else c.parentNode.removeChild(c);}
        const sourceRels=src.src.file(relPath(component.part));const relMap=new Map(sourceRels?elements(parse(await sourceRels.async('string')),'Relationship').map(r=>[r.getAttribute('Id'),r]):[]),added=new Map();
        // Office Tags parts belong to one slide/shape owner. Reusing a tagged
        // component on another page needs private metadata parts, just as a
        // chart instance needs its own workbook. Image media stays shareable.
        for(const node of descendants(group))for(const attr of Array.from(node.attributes||[]))if(attr.namespaceURI===NS.r){const old=attr.value,r=relMap.get(old);if(!r)continue;if(r.getAttribute('Type').endsWith('/hyperlink')){node.removeAttributeNode(attr);continue;}let rid=added.get(old);if(!rid){rid='rId'+relIndex++;const copy=rels.importNode(r,true);copy.setAttribute('Id',rid);if(r.getAttribute('TargetMode')!=='External'){const privatePart=component.dataRisk||r.getAttribute('Type').endsWith('/tags'),target=await src.copy(resolvePart(component.part,r.getAttribute('Target')),privatePart?`p${page+1}-${block.id}`:'');if(block.bindData&&block.chart&&r.getAttribute('Type').endsWith('/chart'))await bindNativeChart(zip,target,block.chart,override,slide.stylePolicy==='harmonized'||plan.workflow==='hermes'?template:undefined);copy.setAttribute('Target',path.posix.relative(path.posix.dirname(part),target));}rels.documentElement.appendChild(copy);added.set(old,rid);}attr.value=rid;attr.nodeValue=rid;}
        if(['source','harmonized'].includes(block.colorMode)){src.themes=src.themes||new Map();let theme=src.themes.get(component.part);if(!theme){theme=await readSourceTheme(src.src,component.part);src.themes.set(component.part,theme);}freezeSourceTheme(group,theme);}
        if(block.flatStyle)for(const key of ['effectLst','effectDag','scene3d','sp3d'])for(const n of [...elements(group,key)])n.parentNode.removeChild(n);
        const placed=fitBox(block,component,template),sx=placed.w/component.bounds.w,sy=placed.h/component.bounds.h;if(block.fitMode==='fill')preserveIconAspect(group,sx,sy);
        if(block.colorMode==='harmonized')harmonizeNative(group,template);
        const smallText=[],textTargets=[];
        if(block.bindText&&block.textBindings){const targets=editableTextTargets(group,{legacy:component.slotPolicy==='legacy'||!component.analysisVersion});targets.forEach((n,i)=>{
          const key=targetKeys.get(n),slot=component.slots?.find(s=>s.key===key)||component.slots?.[i];
          let owner=n;while(owner&&owner.localName!=='sp'&&owner.localName!=='graphicFrame')owner=owner.parentNode;const shapeId=Number(owner?first(owner,'cNvPr')?.getAttribute('id'):0),runSizes=elements(n,'rPr').map(p=>Number(p.getAttribute('sz'))/100).filter(v=>v>0);textTargets.push({key,slot:slot?.index??i,shapeId,row:slot?.table?slot.table.row+1:0,column:slot?.table?slot.table.column+1:0,preserveSourceFontSize:true,sourceFontSizesPt:[...new Set(runSizes.length?runSizes:['defRPr','endParaRPr'].flatMap(name=>elements(n,name)).map(p=>Number(p.getAttribute('sz'))/100).filter(v=>v>0))]});
          if(isDecorativeSourceSlot({...slot,key:slot?.key||key},component)){replaceTextPreservingStyles(doc,n,'');textTargets[textTargets.length-1].decorative=true;return;}
          const binding=block.textBindings.find(b=>b.key&&b.key===key)||(!block.textBindings.some(b=>b.key)?block.textBindings.find(b=>b.slot===i):null);
          if(!binding)throw new Error(`第 ${page+1} 页素材位置与文字不匹配，已停止导出`);
          if(component.analysisVersion&&component.slotPolicy!=='legacy'&&slot?.required&&!binding.text.trim())throw new Error(`第 ${page+1} 页存在未填充的文字位置`);
          const uniform=slot?.role==='label'&&!slot.fixed?uniformLabelFontSize(n):undefined;
          const value=balancedLabelText(binding.text,slot,{fontSize:binding.style?.fontSize||uniform||slot?.font,widthPt:slot?.position?.w*component.width/12700*sx});if(elements(n,'t').map(t=>t.textContent).join('')!==value)replaceTextPreservingStyles(doc,n,value);
          if(uniform!==undefined)Object.assign(textTargets[textTargets.length-1],{requestedTypography:{fontSize:uniform},preserveSourceFontSize:false});
          if(binding.style){const requestedTypography={...(uniform!==undefined?{fontSize:uniform}:{}),...applyBindingStyle(n,binding.style)};Object.assign(textTargets[textTargets.length-1],{requestedTypography,preserveSourceFontSize:requestedTypography?.fontSize===undefined});}
          if(slot?.role==='label'&&binding.style?.vAlign==='middle')centerLabelOnContainer(n,group);
          if(slot?.role==='label'&&/^[\u3400-\u9fff]{2}\n[\u3400-\u9fff]{2}$/.test(value))fitTwoLineLabel(n,binding.style?.fontSize||uniform||slot.font);
          if(component.analysisVersion&&component.slotPolicy!=='legacy'){if(template.designPalette?.mode!=='material'){if(block.colorMode==='harmonized')harmonizedText(n,group,template);else applyTextColor(n,slot?.textColor);}const font=fitMaterialText(n,slot,value,Math.min(sx,sy),component,{sx,sy});if(font&&font<12)smallText.push({slot:i,font});}
        });}
        else if(block.bindText){const texts=textNodes(group).filter(n=>textOf(n).trim());const values=block.textMap?.length?block.textMap:slide.bullets;texts.forEach((n,i)=>replaceTextPreservingStyles(doc,n,values[i]||''));}
        if(smallText.length)warnings.push(`第 ${page+1} 页：${smallText.length} 个原生文字位置空间较小（最低 ${Math.min(...smallText.map(s=>s.font))} 磅），可选择更宽松的设计。`);
        if(block.bindData&&block.chart&&chartRenderer){const rendered=await chartRenderer(block.chart,template,block,1);if(rendered.files)charts.push({page:page+1,...rendered.files});if(rendered.warnings)warnings.push(...rendered.warnings.map(w=>`第 ${page+1} 页：${w}`));}else if(component.dataRisk&&!block.textBindings)warnings.push(`第 ${page+1} 页：手动加入的${component.dataKinds.join('/')}组件保留素材原始数据，请核对。`);
        const photoPlaceholders=/(?:照片|图片)(?:待补充|待提供)|图片位\d/.test((slide.bullets||[]).join(' '))?replaceExamplePhotos(group,{color:component.slots?.find(s=>s.role==='body'&&!s.decorative)?.textColor||'666666'}):0;
        const nativeCount=elements(group,'cNvPr').length-1;if(component.analysisVersion&&nativeCount!==component.nativeObjects)throw new Error(`第 ${page+1} 页原生对象数量发生变化，已停止导出`);
        preventTextAutofit(group);scaleNativeTables(group,sx,sy);
        recolor(group,template,block.colorMode);tree.appendChild(group);audit.push({page:page+1,componentId:component.id,source:component.sourceName,sourcePage:component.page,nodeIndices:component.nodeIndices,nodePaths:component.nodePaths,native:true,nativeObjectCount:nativeCount,sourceNativeObjects:component.sourceNativeObjects||nativeCount,suppressedNativeObjects:component.suppressedNativeObjects||0,suppressedSourceIds:component.suppressedSourceIds||[],materialFingerprint:component.fingerprint,photoPlaceholders,preserveSourceFontSize:textTargets.every(t=>t.preserveSourceFontSize!==false),smallText,textTargets,layout:Boolean(component.layout),textBound:Boolean(block.textBindings),slotCount:block.textBindings?.length||0,dataBound:Boolean(block.bindData),objectKinds:component.dataKinds,placement:{x:block.x,y:block.y,w:block.w,h:block.h}});
      }else if(block.type==='connector'){
        const id=nextId++,a=groupIds.get(block.from),b=groupIds.get(block.to),x=Math.round(block.x*template.width),y=Math.round(block.y*template.height),w=Math.round(block.w*template.width),h=Math.round(block.h*template.height);
        const node=parse(`<p:cxnSp xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:nvCxnSpPr><p:cNvPr id="${id}" name="流程连接 ${id}"/><p:cNvCxnSpPr>${a?`<a:stCxn id="${a}" idx="3"/>`:''}${b?`<a:endCxn id="${b}" idx="1"/>`:''}</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="${template.theme.primary}"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>`).documentElement;tree.appendChild(doc.importNode(node,true));
      }else if(block.type==='chart'&&chartRenderer){const rendered=await chartRenderer(block.chart,template,block,nextId);nextId=rendered.nextId;if(rendered.node)tree.appendChild(doc.importNode(rendered.node,true));if(rendered.files)charts.push({page:page+1,...rendered.files});if(rendered.warnings)warnings.push(...rendered.warnings.map(w=>`第 ${page+1} 页：${w}`));}
    }
    const notePart=`ppt/notesSlides/composed-${page+1}.xml`,notesText=[slide.title,slide.subtitle,...slide.bullets,slide.notes||''].filter(Boolean).join('\n');
    zip.file(notePart,`<p:notes xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${textShape(2,notesText,0,0,6000000,6000000,14)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`);
    zip.file(relPath(notePart),`<Relationships xmlns="${relNS}"><Relationship Id="rId1" Type="${NS.r}/notesMaster" Target="${path.posix.relative(path.posix.dirname(notePart),resolvePart('ppt/presentation.xml',notesMaster.getAttribute('Target')))}"/><Relationship Id="rId2" Type="${NS.r}/slide" Target="../slides/composed-${page+1}.xml"/></Relationships>`);
    override(notePart,'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml');const nr=rels.createElementNS(relNS,'Relationship');nr.setAttribute('Id','rId'+relIndex++);nr.setAttribute('Type',NS.r+'/notesSlide');nr.setAttribute('Target','../notesSlides/composed-'+(page+1)+'.xml');rels.documentElement.appendChild(nr);
if(!fullEnding&&plan.designProfile!=='research-defense'&&(plan.pageChrome||template.pageChrome)){const chrome=applyPageChrome(doc,template,plan.pageChrome||template.pageChrome,page,slide.kind==='cover');chromeChanges.push(chrome);}if(template.bnaProfile&&!bnaCover&&!fullEnding)chromeChanges.push(layoutBnaContent(doc,template,template.bnaProfile,slide,page,navigationSections(plan)));if(slide.nativeEdits?.length)await applyNativeEditsToDocument(zip,part,doc,rels,template,slide.nativeEdits,{contentTypesDoc:typesDoc});zip.file(part,serialize(doc));zip.file(relPath(part),serialize(rels));override(part,'application/vnd.openxmlformats-officedocument.presentationml.slide+xml');
    const rid='rId'+(Math.max(0,...elements(prels,'Relationship').map(n=>Number(n.getAttribute('Id').replace(/^rId/,''))||0))+1),r=prels.createElementNS(relNS,'Relationship');r.setAttribute('Id',rid);r.setAttribute('Type',NS.r+'/slide');r.setAttribute('Target','slides/composed-'+(page+1)+'.xml');prels.documentElement.appendChild(r);const id=pdoc.createElementNS(NS.p,'p:sldId');id.setAttribute('id',String(256+page));id.setAttributeNS(NS.r,'r:id',rid);slideList.appendChild(id);
  }
  if(plan.designProfile==='research-defense'){const size=first(pdoc,'sldSz');size.setAttribute('cx',String(template.width));size.setAttribute('cy',String(template.height));}
  zip.file('ppt/presentation.xml',serialize(pdoc));zip.file('ppt/_rels/presentation.xml.rels',serialize(prels));zip.file('[Content_Types].xml',serialize(typesDoc));
  const skillFont=plan.styleSkillSnapshot?.fontFamily;await normalizeDeckFonts(zip,skillFont?{title:skillFont,body:skillFont,latin:skillFont}:plan.styleSkillSnapshot?.fontPolicy);
  return {buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),warnings,audit,charts,chromeChanges};
}
