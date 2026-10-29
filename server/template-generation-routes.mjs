import path from 'node:path';
import {stopTemplateGeneration,startTemplateGeneration,resumeTemplateGeneration,templateGeneration,publicTemplateGeneration,saveGeneratedTemplate,templateGenerationDirectory} from './template-generation.mjs';
export function installTemplateGenerationRoutes(app,auth){
 app.post('/api/template-generations',async(req,res)=>res.status(202).json(await startTemplateGeneration(req.user,req.body,{apiKey:req.body.apiKey})));
 app.get('/api/template-generations/:id',async(req,res)=>res.json(publicTemplateGeneration(await templateGeneration(req.params.id,req.user))));
 app.post('/api/template-generations/:id/stop',async(req,res)=>res.json(await stopTemplateGeneration(req.params.id,req.user)));
 app.post('/api/template-generations/:id/resume',async(req,res)=>res.status(202).json(await resumeTemplateGeneration(req.params.id,req.user,{apiKey:req.body.apiKey})));
 app.post('/api/template-generations/:id/save',async(req,res)=>{const card=await saveGeneratedTemplate(req.params.id,req.user);if(card.nativeTemplate?.previewKey)await auth.claim('previews',card.nativeTemplate.previewKey,req.user.id);res.json(card);});
 app.get('/api/template-generations/:id/file',async(req,res)=>{const job=await templateGeneration(req.params.id,req.user);if(!job.hasFile)return res.status(409).json({error:'模板文件尚未生成'});res.set('Cache-Control','private, no-store').download(path.join(templateGenerationDirectory,job.id,'template.pptx'),job.input.name.replace(/[<>:"/\\|?*]/g,'_')+'.pptx');});
 app.get('/api/template-generations/:id/previews/:page.png',async(req,res)=>{const job=await templateGeneration(req.params.id,req.user),page=Number(req.params.page);if(!job.hasFile||!Number.isInteger(page)||page<1||page>job.input.layoutCount)return res.sendStatus(404);res.set('Cache-Control','private, no-store').sendFile(path.join(templateGenerationDirectory,job.id,'previews',page+'.png'));});
}
