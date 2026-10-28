import React,{useEffect,useState} from 'react';
import {Check,ImageIcon,Layers} from 'lucide-react';
import './visual-selection.css';

function Thumbnail({src,alt}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src]);
  return src&&!failed?<img src={src} alt={alt} loading="lazy" onError={()=>setFailed(true)}/>:<div className="selection-image-missing"><ImageIcon size={22}/><span>暂无素材预览</span></div>;
}
function sourceLabel(candidate){return `${candidate.sourceName||'素材库组件'}${candidate.sourcePage?` · 第 ${candidate.sourcePage} 页`:''}`;}
function thumbnail(candidate){return candidate.thumbnail||(candidate.materialId?`/api/components/${encodeURIComponent(candidate.materialId)}/preview`:undefined);}

export default function VisualSelection({selection,currentMaterialId}){
  if(!selection)return null;
  const candidates=Array.isArray(selection.candidates)?selection.candidates:[],selected=candidates.find(candidate=>candidate.materialId===selection.selectedMaterialId)||candidates.find(candidate=>candidate.selected)||{materialId:selection.selectedMaterialId,sourceName:selection.sourceName,sourcePage:selection.sourcePage,reason:selection.reason},usesImages=selection.mode==='image-understanding',isCurrent=!currentMaterialId||!selection.selectedMaterialId||currentMaterialId===selection.selectedMaterialId;
  return <section className="visual-selection" aria-label="本页选材依据">
    <div className="visual-selection-heading"><Layers size={15}/><strong>{isCurrent?'本页选材依据':'生成时的选材依据'}</strong><span className={usesImages?'image-understanding':'geometry-only'}>{usesImages?'图像理解选版':'构图特征选版'}</span></div>
    <p className="visual-selection-method">{usesImages?'DeepSeek 结合候选素材缩略图与页面内容进行选择。':'依据素材的构图、比例及可编辑文字位置匹配；本次未使用图像理解。'}</p>
    {!isCurrent&&<p className="visual-selection-history">当前页已更换素材，下方保留生成时的选择记录。</p>}
    <figure className="visual-selected-candidate"><div className="visual-selected-image"><Thumbnail src={thumbnail(selected)} alt={`选中素材：${sourceLabel(selected)}`}/><span><Check size={12}/>已选素材</span></div><figcaption>{sourceLabel(selected)}</figcaption></figure>
    <p className="visual-selection-reason">{selection.reason||selected.reason||'本页尚未记录选材理由。'}</p>
    {(candidates.length>0||selection.referenceThumbnail||selection.contactSheetUrl)&&<details className="visual-selection-candidates"><summary>查看候选设计与选择理由{candidates.length>0?`（${candidates.length} 个）`:''}</summary>
      {selection.referenceThumbnail&&<figure className="visual-selection-reference"><Thumbnail src={selection.referenceThumbnail} alt="本页选材使用的参考图"/><figcaption>选材参考图</figcaption></figure>}
      {selection.contactSheetUrl&&<a className="text-link visual-contact-link" href={selection.contactSheetUrl} target="_blank" rel="noreferrer">查看候选素材总览图</a>}
      <div className="visual-candidate-grid">{candidates.map((candidate,i)=>{const active=candidate.materialId===selection.selectedMaterialId||candidate.selected;return <article key={candidate.materialId||i} className={`visual-candidate ${active?'selected':''}`}><div className="visual-candidate-image"><Thumbnail src={thumbnail(candidate)} alt={`候选 ${i+1}：${sourceLabel(candidate)}`}/><span>{active?<Check size={11}/>:i+1}</span></div><strong>{sourceLabel(candidate)}</strong>{candidate.reason&&<p>{candidate.reason}</p>}{Number.isFinite(candidate.score)&&<small>匹配分：{Math.round(candidate.score*100)/100}</small>}</article>;})}</div>
    </details>}
  </section>;
}
