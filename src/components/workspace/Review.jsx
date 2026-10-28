import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Undo2,
  Search,
  LayoutGrid,
  RefreshCw,
  Loader2,
  SlidersHorizontal,
  Layers,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { FormSelect } from "./forms";
import SlideImage from "./SlideImage";
import NativeSelection from './NativeSelection';
import {useAuth} from '@/components/AuthGate';
const PageAgentPanel=lazy(()=>import('./PageAgentPanel'));

export default function Review({ s, onBack }) {
  const canViewLibrary=useAuth()?.user?.role==='owner';
  const centerRef=useRef(null),gridRef=useRef(null),[paneHeight,setPaneHeight]=useState(0),[viewportRoom,setViewportRoom]=useState(0);
  useEffect(()=>{const node=centerRef.current;if(!node)return;const sync=()=>{setPaneHeight(Math.ceil(node.getBoundingClientRect().height));const top=gridRef.current?.getBoundingClientRect().top||180;setViewportRoom(Math.max(180,window.innerHeight-Math.max(72,top)-40));};sync();const observer=new ResizeObserver(sync);observer.observe(node);window.addEventListener('resize',sync);window.addEventListener('scroll',sync,{passive:true});return()=>{observer.disconnect();window.removeEventListener('resize',sync);window.removeEventListener('scroll',sync);};},[s.output?.id]);
  const [inspection,setInspection]=useState(null),[selectedIds,setSelectedIds]=useState([]),[selecting,setSelecting]=useState(false);
  useEffect(()=>{setInspection(null);setSelectedIds([]);},[s.output?.id,s.page]);
  const [allPages, setAllPages] = useState(false),
    output = s.output,
    slide = s.slide;
  if (!output || !s.plan) return null;
  const slides = s.plan.slides,
    summary = output.execution?.summary,
    preview = (n) => `/api/previews/${output.id}/${n + 1}.png`;
  return (
    <div className="review-view">
      <div className="review-toolbar">
        <div className="review-title">
          <Badge variant="secondary">
            <CheckCircle2 size={13} />
            已生成
          </Badge>
          <h2>{output.title}</h2>
          <span>{slides.length} 页 · 可编辑 PPTX</span>
        </div>
        <div className="toolbar-actions">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft />
            返回作品
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAllPages(true)}>
            <LayoutGrid />
            全页预览
          </Button>
          <Button asChild size="sm">
            <a href={output.url || `/api/files/${output.id}.pptx`}>
              <Download />
              下载 PPT
            </a>
          </Button>
        </div>
      </div>
      {s.busy && (
        <div className="notice" role="status">
          <Loader2 size={16} className="animate-spin" />
          {s.busy}
          <span>已完成的页面会保留</span>
        </div>
      )}
      <div className="review-grid" ref={gridRef} style={paneHeight?{'--review-pane-height':paneHeight+'px','--review-viewport-room':viewportRoom+'px'}:undefined}>
        <nav className="slide-filmstrip" aria-label="幻灯片列表">
          <div className="filmstrip-label">
            全部页面 <Badge variant="secondary">{slides.length}</Badge>
          </div>
          {slides.map((v, i) => (
            <button
              key={i}
              className={`filmstrip-page ${i === s.page ? "selected" : ""}`}
              aria-current={i === s.page ? "page" : undefined}
              onClick={() => s.setPage(i)}
            >
              <div className="filmstrip-image">
                <SlideImage src={preview(i)} alt={`第${i + 1}页预览`} />
                <span>{String(i + 1).padStart(2, "0")}</span>
              </div>
              <strong>{v.title}</strong>
            </button>
          ))}
        </nav>
        <section className="review-center" ref={centerRef}>
          <div className="preview-navigation">
            <div>
              <Badge variant="outline">第 {s.page + 1} 页</Badge>
              <span>
                {slide?.kind === "cover" ? "用户模板封面" : "素材原生设计"}
              </span>
            </div>
            <div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="上一页"
                disabled={s.page === 0}
                onClick={() => s.setPage(s.page - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {s.page + 1} / {slides.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="下一页"
                disabled={s.page === slides.length - 1}
                onClick={() => s.setPage(s.page + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div className="presentation-preview with-object-selection">
            <NativeSelection inspection={inspection} selectedIds={selectedIds} onSelect={setSelectedIds} enabled={selecting} onEnabled={setSelecting}/>
            <SlideImage
              src={preview(s.page)}
              alt={slide?.title || "当前页面"}
            />
            {s.photoTargetPreview?.page===s.page&&<div className="photo-target-preview" aria-label="照片放置区域预览" style={{left:s.photoTargetPreview.box.x*100+'%',top:s.photoTargetPreview.box.y*100+'%',width:s.photoTargetPreview.box.w*100+'%',height:s.photoTargetPreview.box.h*100+'%'}}><span>照片放置区域</span></div>}
          </div>
          <div className="preview-caption">
            <span>
              <CheckCircle2 size={15} />
              {output.textFit?.status === "checked"
                ? "已通过文字边界检查"
                : "查看预览后确认排版"}
            </span>
            <span>微软雅黑 · 素材原色与字体层级</span>
          </div>
          <Card className="page-details">
            <CardContent>
              <Accordion type="multiple">
                <AccordionItem value="content">
                  <AccordionTrigger>本页内容与选材依据</AccordionTrigger>
                  <AccordionContent>
                    <h3>{slide?.title}</h3>
                    <ul>
                      {slide?.bullets?.map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                    {slide?.visualSelection?.reason && (
                      <p className="selection-reason">
                        选材理由：{slide.visualSelection.reason}
                      </p>
                    )}
                    {slide?.tagMatch?.reasons?.length > 0 && (
                      <div className="tag-row">
                        {slide.tagMatch.reasons.map((v, i) => (
                          <Badge variant="secondary" key={i}>
                            {v}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="layout">
                  <AccordionTrigger>调整本页布局</AccordionTrigger>
                  <AccordionContent>
                    <div className="inline-controls">
                      <FormSelect
                        aria-label="本页内容占比"
                        value={s.densityDraft}
                        onChange={(e) => s.setDensityDraft(e.target.value)}
                      >
                        <option value="full">充分使用主体区域</option>
                        <option value="balanced">均衡布局</option>
                        <option value="spacious">宽松留白</option>
                      </FormSelect>
                      <Button
                        variant="outline"
                        disabled={!!s.busy}
                        onClick={s.applyDensity}
                      >
                        <SlidersHorizontal />
                        应用本页
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                {summary && (
                  <AccordionItem value="metrics">
                    <AccordionTrigger>制作耗时与检查记录</AccordionTrigger>
                    <AccordionContent>
                      <div className="metric-tiles">
                        <div>
                          <b>{(summary.activeElapsedMs / 1000).toFixed(1)}秒</b>
                          <small>有效运行时间</small>
                        </div>
                        <div>
                          <b>{summary.modelRequests}</b>
                          <small>模型请求次数</small>
                        </div>
                        <div>
                          <b>{summary.toolFailures || 0}</b>
                          <small>工具校验失败次数</small>
                        </div>
                      </div>
                      <p className="muted">
                        累计各轮有效运行，不含等待恢复的空闲时间。
                      </p>
                      {output.bundleUrl && (
                        <Button asChild variant="outline" size="sm">
                          <a href={output.bundleUrl}>
                            <Download />
                            下载PPT与图表资料包
                          </a>
                        </Button>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            </CardContent>
          </Card>
        </section>
        <aside className="design-recommendations">
          <Suspense fallback={<p className="muted">正在载入页面智能体…</p>}><PageAgentPanel s={s} onInspection={setInspection} selectedIds={selectedIds} onClearSelection={()=>setSelectedIds([])}>
          <div className="recommendation-heading">
            <div className="section-title">
              <Layers size={18} />
              <h3>替换本页设计</h3>
            </div>
            <p>只替换当前页，系统会重新适配文案。</p>
          </div>
          <div className="recommendation-actions">
            <Button size="sm" variant="outline" disabled={s.recommendLoading||!!s.busy||s.pageWorkBusy} onClick={()=>void s.refreshRecommendations({reset:!!s.recommendations.exhausted})}>
              <RefreshCw className={s.recommendLoading?'animate-spin':''}/>{s.recommendations.exhausted?'重新开始推荐':'刷新推荐'}
            </Button>
            {canViewLibrary&&<Button
              size="sm"
              variant="outline"
              disabled={!!s.busy||s.pageWorkBusy}
              onClick={() => s.browseMaterials("replace")}
            >
              <Search />
              从素材库挑选
            </Button>}
            <Button
              variant="ghost"
              size="icon"
              aria-label="撤销上次换版"
              disabled={!s.previousOutput || !!s.busy || s.pageWorkBusy || !!s.output?.conversationRootId}
              onClick={s.undoChoice}
            >
              <Undo2 />
            </Button>
          </div>
          {s.recommendLoading ? (
            <div className="recommendation-cards">
              <p role="status">AI 正在为本页挑选 5 页素材…</p>
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="recommendation-skeleton" />
              ))}
            </div>
          ) : (
            <div className="recommendation-cards">
              {s.recommendations.items.map((item, i) => {
                const active = slide?.materialId === item.id;
                return (
                  <Button
                    variant="ghost"
                    className={`recommendation-card ${active ? "selected" : ""}`}
                    key={item.id}
                    disabled={!!s.busy || s.pageWorkBusy || active}
                    onClick={() => s.replaceMaterial(item)}
                    title={item.reason}
                  >
                    <div className="recommendation-image">
                      <SlideImage src={item.thumbnail} alt={item.title} />
                      <Badge variant={active ? "default" : "secondary"}>
                        {active ? "当前" : String(i + 1).padStart(2, "0")}
                      </Badge>
                    </div>
                    <strong>
                      {item.title.replace(/^(完整组合|主体组件) · /, "")}
                    </strong>
                    <small>
                      {item.sourceName} · 第 {item.page} 页
                    </small>
                    <p className="recommendation-reason">{item.reason}</p>
                  </Button>
                );
              })}
            </div>
          )}
          {!s.recommendLoading&&s.recommendations.note&&<p className="recommendation-note" role={s.recommendations.error?'alert':'status'}>{s.recommendations.note}</p>}
          {!s.recommendLoading && !s.recommendations.items.length && (
            <div className="recommendation-empty">
              <LayoutGrid size={25} />
              <p>
                {slide?.kind === "cover"
                  ? "封面沿用用户模板。你可以在“我的模板”中更换。"
                  : canViewLibrary?"暂未找到合适的推荐，可从素材库中继续筛选。":"暂未找到合适的推荐，可以刷新推荐，或调整本页内容后重试。"}
              </p>
            </div>
          )}
          <p className="recommendation-footnote">
            换版后重新填充、检查，不直接挪用素材中的旧文案。
          </p>
          </PageAgentPanel></Suspense>
        </aside>
      </div>
      <Dialog open={allPages} onOpenChange={setAllPages}>
        <DialogContent className="all-pages-dialog">
          <DialogHeader>
            <DialogTitle>全页预览</DialogTitle>
            <DialogDescription>
              {output.title} · {slides.length}页
            </DialogDescription>
          </DialogHeader>
          <div className="all-pages-grid">
            {slides.map((v, i) => (
              <button
                key={i}
                onClick={() => {
                  s.setPage(i);
                  setAllPages(false);
                }}
              >
                <SlideImage src={preview(i)} alt={`第${i + 1}页 ${v.title}`} />
                <span>
                  {i + 1}. {v.title}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
