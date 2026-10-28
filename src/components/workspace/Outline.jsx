import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  LayoutTemplate,
  Check,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const kinds = {
  cover: "封面",
  agenda: "目录",
  content: "内容页",
  process: "流程页",
  ending: "结束页",
};
const visuals = {
  parallel: "并列",
  process: "流程",
  compare: "对比",
  hierarchy: "层级",
  cycle: "循环",
  text: "文字",
  architecture: "架构",
  timeline: "时间轴",
  responsibility: "职责",
  hub: "中心关系",
  matrix: "矩阵",
};
export default function Outline({ s, stale, onBack, onPlan, onGenerate }) {
  const plan = s.outlineDraft;
  const sections=Array.isArray(plan?.sections)?plan.sections:[];
  const navigationError=sections.some(v=>!String(v).trim()||[...String(v)].reduce((n,c)=>n+(/[\x00-\xff]/.test(c)?.55:1),0)>6.5)||new Set(sections.map(v=>String(v).trim())).size!==sections.length;
  const update = (index, changes) =>
    s.setOutlineDraft({
      ...plan,
      slides: plan.slides.map((v, i) =>
        i === index ? { ...v, ...changes } : v,
      ),
    });
  if (!plan)
    return (
      <Card className="empty-state">
        <CardContent>
          <LayoutTemplate size={38} />
          <h2>先生成逐页方案</h2>
          <p>添加文档与模板，系统会规划每页主题、要点和布局。</p>
          <Button variant="outline" onClick={onBack}>
            编辑资料
          </Button>
        </CardContent>
      </Card>
    );
  return (
    <div className="outline-workspace">
      <Card className="outline-summary">
        <CardContent>
          <div>
            <Badge variant="secondary">{plan.slides.length} 页逐页方案</Badge>
            <h2>{plan.title}</h2>
          </div>
          <div className="outline-summary-actions">
            <Button variant="ghost" disabled={!!s.busy} onClick={onBack}>
              <ArrowLeft />
              编辑资料
            </Button>
            <Button variant="outline" disabled={!!s.busy} onClick={onPlan}>
              <RefreshCw />
              重新规划
            </Button>
            <Button disabled={!!s.busy || stale || navigationError} onClick={onGenerate}>
              开始制作PPT
              <ArrowRight />
            </Button>
          </div>
        </CardContent>
      </Card>
      {!!sections.length&&<div className="outline-navigation" aria-label="页眉章节关键词"><span>页眉导航 · {sections.length} 章</span><div>{sections.map((label,i)=><Input key={i} aria-label={`第${i+1}章页眉关键词`} value={label} maxLength={12} disabled={!!s.busy} onChange={e=>s.setOutlineDraft({...plan,sections:sections.map((v,n)=>n===i?e.target.value:v)})}/>)}</div></div>}
      {navigationError&&<p className="notice warning" role="alert">页眉关键词不能为空或重复，请使用2–6个中文字或简短英文词组。</p>}
      {stale && (
        <div className="notice warning" role="status">
          文档或生成要求已修改，请重新规划，避免沿用旧方案。
        </div>
      )}
      <div className="outline-list">
        {plan.slides.map((slide, i) => (
          <Card className="outline-page" key={i}>
            <CardContent>
              <div className="outline-page-number">
                {String(i + 1).padStart(2, "0")}
                <Badge variant="outline">{kinds[slide.kind] || "内容页"}</Badge>
              </div>
              <div className="outline-page-content">
                <Input
                  aria-label={`第${i + 1}页标题`}
                  value={slide.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  maxLength={100}
                  disabled={!!s.busy}
                />
                <Textarea
                  aria-label={`第${i + 1}页要点`}
                  value={(slide.bullets || []).join("\n")}
                  onChange={(e) =>
                    update(i, {
                      bullets: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                  disabled={!!s.busy}
                />
              </div>
              <div className="outline-page-structure">
                <span className="small-kicker">布局方向</span>
                <Badge variant="secondary">
                  {visuals[slide.visual] || "按内容匹配"}
                </Badge>
                {slide.materialRequest?.moduleCount && (
                  <p>{slide.materialRequest.moduleCount} 个内容模块</p>
                )}
                {slide.materialRequest?.perModuleChars && (
                  <small>
                    每项预计 {slide.materialRequest.perModuleChars} 字
                  </small>
                )}
                <small>保留素材原字号</small>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="workflow-bottom">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft />
          返回工作台
        </Button>
        <span>
          <Check size={15} />
          你可以修改方案，也可以直接交给系统继续制作
        </span>
        <Button disabled={!!s.busy || stale || navigationError} onClick={onGenerate}>
          开始制作页面
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
