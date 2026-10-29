import React, { useState, useEffect } from "react";
import FailureDesignPanel from './FailureDesignPanel';
import CompletedPagePreview from './CompletedPagePreview';
import {
  Square,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  LayoutTemplate,
  TextCursorInput,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const stageNames = {
  planning: "规划页面内容",
  materials: "匹配素材与布局",
  "visual-selection": "比较候选设计",
  writing: "适配每页文案",
  "content-review": "核对主题与模块关联",
  review: "核查内容完整性",
  export: "检查文字并导出",
  done: "制作完成",
};
export default function Production({ s, planning = false }) {
  const [recoveryPage,setRecoveryPage]=useState(null);
  const job = s.jobSnapshot,
    p = job?.progress || {},
    failed = job?.status === "failed",
    stopped = job?.status === "stopped",
    stopping = job?.status === "stopping",
    settled = failed || stopped,
    done = p.completedPages || [],
    total = p.totalPages || s.liveOutline?.slides?.length || 0,
    issues = job?.recovery?.status==='ready'?[]:p.failedPages || [];
  useEffect(()=>{if(failed)setRecoveryPage(issues[0]?.page||null);},[job?.id,failed]);
  return (
    <div className={failed?'production-with-recovery':'production-layout'}>
    <Card className="production-card">
      <CardHeader className="relative">
        {['running','queued','stopping'].includes(job?.status)&&<Button variant="outline" size="sm" className="absolute right-6 top-6" disabled={stopping} onClick={s.stopJob}><Square size={14}/>{stopping?'正在停止':'停止生成'}</Button>}
        <div className={`production-symbol ${settled ? "failed" : ""}`}>
          {settled ? (
            <AlertCircle size={28} />
          ) : (
            <Loader2 size={28} className="animate-spin" />
          )}
        </div>
        <CardTitle>
          {stopped ? "已停止，进度已保存" : stopping ? "正在停止任务" : failed
            ? "进度已保存，可以继续"
            : planning
              ? "正在规划逐页方案"
              : "正在把方案制作成PPT"}
        </CardTitle>
        <CardDescription>
          {stopping ? "等待当前操作安全结束，已完成内容会保留。" : settled
            ? "已完成的页面会保留，继续时仅处理剩余或未通过的页面。"
            : "可以在这里查看真实进度。文案、图形和素材将逐页适配。"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="production-status">
          <span>{stopping?job.phase:stageNames[p.stage] || "正在准备任务"}</span>
          <strong>
            {total ? `${done.length} / ${total} 页完成` : "正在组织内容"}
          </strong>
        </div>
        <Progress value={total ? (done.length / total) * 100 : 0} />
        <div className="production-stages">
          {[
            [FileText, "内容规划"],
            [LayoutTemplate, "选材与布局"],
            [TextCursorInput, "文案填充"],
            [ShieldCheck, "检查与交付"],
          ].map(([Icon, label], i) => (
            <div key={label}>
              <Icon size={21} />
              <span>{label}</span>
            </div>
          ))}
        </div>
        {p.stage==='writing'&&p.batchSize===1&&<div className="page-agent-progress" aria-label="逐页智能体并行状态"><p>每页独立智能体 · 最多 {p.concurrency||4} 页并行 · 当前 {(p.activePages||[]).length} 页运行</p><div>{(p.workers||[]).filter(w=>w.pages?.length).map(w=><div key={w.id} className="page-agent-card"><Loader2 size={15} className="animate-spin"/><strong>第 {w.pages[0]} 页</strong><span>{w.role?.startsWith('chart-copy')?'图表文字修复':'独立撰写与修改'}</span></div>)}</div></div>}
        {total > 0 && (
          <div className="production-pages">
            {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                disabled={!failed||done.includes(n)}
                aria-label={`选择第${n}页进行人工选版`}
                aria-pressed={recoveryPage===n}
                onClick={()=>setRecoveryPage(n)}
                className={
                  done.includes(n)
                    ? "complete"
                    : issues.some((v) => v.page === n)
                      ? "failed"
                      : (p.activePages || []).includes(n)
                        ? "active"
                        : ""
                }
                title={`第${n}页${done.includes(n) ? "已完成" : ""}`}
              >
                {done.includes(n) ? <CheckCircle2 size={14} /> : n}
              </button>
            ))}
          </div>
        )}
        {settled && (
          <div className="production-recovery">
            {job.recovery?.status==='ready'&&<strong>Hermes 启动环境已恢复</strong>}
            <p>{stopped?'停止操作已完成，可从断点继续。':job.recovery?.message || job.error || s.error}</p>
            {job.recovery?.originalError&&<details><summary>查看此前错误</summary><p>{job.recovery.originalError}</p></details>}
            <Button onClick={stopped&&job.kind==='replace'?()=>s.setJobSnapshot(null):s.resumeJob} disabled={s.resuming || !!s.busy}>
              <RefreshCw className={s.resuming ? "animate-spin" : ""} />
              {stopped&&job.kind==='replace'?'返回原稿':job.recovery?.status==='ready'?'继续生成':'继续完成剩余页面'}
            </Button>
          </div>
        )}
        {issues.length > 0 && (
          <Accordion type="single" collapsible>
            <AccordionItem value="issues">
              <AccordionTrigger>
                查看 {issues.length} 页需要处理的原因
              </AccordionTrigger>
              <AccordionContent>
                {issues.map((v) => (
                  <p className="production-issue" key={v.page}>
                    第 {v.page} 页：{v.error}
                  </p>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        <Accordion type="single" collapsible>
          <AccordionItem value="details">
            <AccordionTrigger>查看任务详情</AccordionTrigger>
            <AccordionContent>
              <dl className="diagnostic-list">
                <dt>任务编号</dt>
                <dd>{job?.id || "正在提交"}</dd>
                <dt>当前阶段</dt>
                <dd>{job?.phase || s.busy || "等待任务状态"}</dd>
                <dt>模型请求</dt>
                <dd>{p.modelRequests ?? "等待统计"}</dd>
                <dt>有效运行</dt>
                <dd>
                  {Number.isFinite(p.elapsedMs)
                    ? (p.elapsedMs / 1000).toFixed(1) + "秒"
                    : "等待统计"}
                </dd>
              </dl>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Button
          variant="link"
          className="w-full"
          onClick={() => s.setTab("hermes")}
        >
          打开 Hermes 工作台，查看执行记录
        </Button>
        <p className="production-note">
          保留原生素材对象 · 使用微软雅黑 · 检查字号与文字边界
        </p>
      </CardContent>
    </Card>
    {failed&&job?.recovery?.status!=='ready'&&<FailureDesignPanel s={s} page={recoveryPage} onPageChange={setRecoveryPage}/>}
    {!planning&&job?.id&&<CompletedPagePreview job={job}/>}
    </div>
  );
}
