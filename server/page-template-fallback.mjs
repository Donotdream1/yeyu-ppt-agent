import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {dataDir,sourceBuffer} from './library.mjs';
import {analyzeMaterial} from './material-analysis.mjs';
import {composeDeck} from './composition.mjs';
import {composeHermesSlide} from './page-layout.mjs';
import {contentUnits} from './designer.mjs';
import {openZip,slideOrder,parse,serialize,first,elements} from './ooxml.mjs';
import {drawingNodes} from './components.mjs';
import {throwIfTaskStopped,isTaskStopped} from './task-control.mjs';

// A fallback template is made from actual editable library modules. It is an
// unlisted source for this deck, never a new global library entry or screenshot.
export async function generatePageTemplate(slide,{components,template,sourceId,runAgent,apiKey,model,onPhase=()=>{},onMetrics=()=>{},excludeIds=[]}={}){
 throwIfTaskStopped();
 if(['cover','ending'].includes(slide.kind)||slide.chart)throw Error('封面、结束页和统计图须使用对应的完整原生版式');
 const count=Math.max(1,Math.min(6,contentUnits(slide).length||slide.bullets?.length||1)),excluded=new Set(excludeIds);
 const raw=components.filter(c=>!excluded.has(c.id)&&(!sourceId||c.sourceId===sourceId)&&c.autoUse!==false&&c.pageTags?.reuse?.generationReady!==false&&!c.dataRisk&&c.editable!==false&&c.type==='group'&&!c.layout&&c.nodeIndices?.length&&c.nativeObjects>=2&&c.textSlots>=2&&c.textSlots<=8).sort((a,b)=>(b.nativeObjects-b.textSlots)-(a.nativeObjects-a.textSlots)).slice(0,32),candidates=[];
 for(const item of raw){throwIfTaskStopped();try{const c=await analyzeMaterial(item),slots=c.slots.filter(s=>!s.fixed&&!s.decorative);if(slots.length>=2&&slots.length<=8&&slots.some(s=>s.maxChars>=20)&&!c.structure?.connectors?.length)candidates.push(c);}catch(e){if(isTaskStopped(e))throw e;}if(candidates.length===8)break;}
 if(!candidates.length)throw Error('当前配色套系缺少可重组的标题与正文组件，请补充可编辑模块；已完成页面保留');
 await onPhase('未找到适配素材，Hermes 正在用原生组件生成本页模板');
 let choice;
 const tool={name:'ppt_design_page_template',description:'选择真实组件及模块排列，生成当前页的可编辑模板。',parameters:{type:'object',properties:{componentId:{type:'string',enum:candidates.map(c=>c.id)},arrangement:{type:'string',enum:['rows','grid']},reason:{type:'string'}},required:['componentId','arrangement','reason']}};
 const skill=await fs.readFile(path.resolve('agents/skills/template-design/SKILL.md'),'utf8');
 await runAgent({id:randomUUID(),role:'page-template-designer',apiKey,model,allowSkillTool:false,maxIterations:2,maxTokens:3000,timeoutMs:180000,systemPrompt:skill+'\n本次只设计一页模板。仅重用提供的原生组件，保留源色、字号与字体层级。根据内容安排模块，不使用截图，不复制业务示例，不改变事实，不创建新的数据。短标题和解释必须有各自的阅读空间。',message:JSON.stringify({title:slide.title,units:contentUnits(slide),moduleCount:count,visual:slide.visual,candidates:candidates.map(c=>({id:c.id,sourceName:c.sourceName,slots:c.slots.filter(s=>!s.decorative).map(s=>({role:s.role,maxChars:s.maxChars,font:s.font}))}))}),tools:[tool],onTool:async(name,args)=>{if(name!==tool.name||!candidates.some(c=>c.id===args.componentId)||!['rows','grid'].includes(args.arrangement)||!String(args.reason||'').trim())throw Error('请选择真实组件并说明本页排列方式');choice=args;return {ok:true};},completeWhen:(_,r)=>r.ok,onMetrics});
 throwIfTaskStopped();if(!choice)throw Error('Hermes 尚未提交有效的本页模板');
 const seed=candidates.find(c=>c.id===choice.componentId),cols=choice.arrangement==='grid'&&count>1?count===2?2:Math.min(3,Math.ceil(count/2)):1,rows=Math.ceil(count/cols),gap=.025,w=(.96-gap*(cols-1))/cols,h=(.96-gap*(rows-1))/rows;
 const blank=await openZip(await fs.readFile(new URL('./base.pptx',import.meta.url))),order=await slideOrder(blank);
 for(const part of order.paths){const doc=parse(await blank.file(part).async('string'));doc.documentElement.setAttribute('showMasterSp','0');for(const n of drawingNodes(doc))n.parentNode.removeChild(n);blank.file(part,serialize(doc));}
 const presentation=parse(await blank.file('ppt/presentation.xml').async('string')),size=first(presentation,'sldSz');size.setAttribute('cx',String(template.width));size.setAttribute('cy',String(template.height));blank.file('ppt/presentation.xml',serialize(presentation));
 const canvas=await blank.generateAsync({type:'nodebuffer'}),frame={id:'fallback-canvas',sourceId:'fallback-canvas',width:template.width,height:template.height,pages:order.paths.map((part,i)=>({part,page:i+1})),theme:{font:'微软雅黑',primary:template.theme.primary,text:template.theme.text||'202020'},safeArea:{x:0,y:0,w:1,h:1}};
 const blocks=Array.from({length:count},(_,i)=>({id:'module-'+i,type:'component',componentId:seed.id,materialSnapshot:seed,x:.02+(i%cols)*(w+gap),y:.02+Math.floor(i/cols)*(h+gap),w,h,fitMode:'fill',bindText:true,colorMode:'source',textBindings:seed.slots.map(s=>({key:s.key,slot:s.index,text:s.decorative?'':s.fixed||(['label','title'].includes(s.role)?'模块标题':'填写对应内容')}))}));
 const composed=await composeDeck({title:'本页生成模板',slides:[{title:'',kind:'content',bullets:[],blocks,stylePolicy:'source'}]},frame,[seed],{loadSource:id=>id==='fallback-canvas'?Promise.resolve(canvas):sourceBuffer(id)});
 throwIfTaskStopped();const source=createHash('sha256').update(composed.buffer).digest('hex').slice(0,16),zip=await openZip(composed.buffer),generatedOrder=await slideOrder(zip),part=generatedOrder.paths[0],doc=parse(await zip.file(part).async('string')),nodes=drawingNodes(doc);
 await fs.mkdir(path.join(dataDir,'sources'),{recursive:true});await fs.writeFile(path.join(dataDir,'sources',source+'.pptx'),composed.buffer);
 const generated=await analyzeMaterial({id:'generated-'+randomUUID(),sourceId:source,sourceName:'本页组件重组模板',page:1,part,width:template.width,height:template.height,bounds:{x:0,y:0,w:template.width,h:template.height},nodeIndices:nodes.map((_,i)=>i),type:'group',scope:'full',layout:true,editable:true,purpose:slide.kind==='agenda'?'agenda':'content',relation:slide.visual||'parallel',title:slide.title,nativeObjects:nodes.reduce((n,v)=>n+elements(v,'cNvPr').length,0),generatedTemplate:{version:1,sourceComponentId:seed.id,sourceId:seed.sourceId,sourcePage:seed.page,moduleCount:count,arrangement:choice.arrangement,reason:choice.reason}});
 const bindings=generated.slots.map(s=>({key:s.key,slot:s.index,text:s.fixed||'预检',contentIds:contentUnits(slide).map(u=>u.id)})),layout=composeHermesSlide({...slide,materialSnapshot:generated,materialBindings:bindings,layoutRecipe:'auto',adaptation:{status:'checked'}},0,template),usage=layout?.layoutReview?.materialUsage;
 if(!usage||usage.width<.75||usage.height<.60||usage.area<.52)throw Error('生成模板未通过主体占比检查，已保留原版本');
 return {component:generated,layout,features:{generatedTemplate:true},tagMatch:{reasons:['按本页模块数生成模板','复用源组件原色与原字号']},metadata:{mode:'generated-template',reason:choice.reason,copyGuidance:'按新模板每个模块的标题与正文位置重新撰写，保留原字号。',sourceName:seed.sourceName,sourcePage:seed.page,selectedMaterialId:generated.id}};
}
