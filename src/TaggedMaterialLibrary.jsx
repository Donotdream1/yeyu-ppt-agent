import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import MaterialAuditProgress from '@/components/workspace/MaterialAuditProgress';
import React, { useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import "./material-pages.css";

const emptyFilters = {
  purpose: "",
  logic: "",
  moduleCount: "",
  perModuleChars: "",
  sourceId: "",
  color: "",
  editable: false,
  review: "",
  topic: "",
  collection: "",
};
const topics = [
  "党建",
  "生产运营",
  "质量管理",
  "设备管理",
  "安全环保",
  "人才培养",
  "技术研发",
  "数字化",
  "综合管理",
];
const cleanArray = (value) => (Array.isArray(value) ? value : []);
const words = (value) =>
  cleanArray(value).filter(Boolean).join("、") || "待核查";
const yesNo = (value) =>
  value === true ? "可编辑" : value === false ? "不可编辑" : "待核查";
const rangeText = (range) =>
  range && Number(range.max) > 0
    ? `${range.min ?? 0}–${range.max} 字`
    : "待核查";
const reviewLabel = (card) =>
  ["已人工复核", "已视觉复核"].includes(card?.review?.status)
    ? card.review.status
    : "待视觉复核";
const canChoose = (card) =>
  Boolean(
    card?.defaultComponentId &&
    card?.reuse?.generationReady &&
    card?.editing?.textEditable,
  );
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body
      ? { "Content-Type": "application/json", ...options.headers }
      : options.headers,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "请求未完成，请稍后重试");
  return result;
}

function PagePreview({ card, large = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [card?.id, card?.thumbnail]);
  return (
    <div
      className={`mp-preview ${large ? "large" : ""}`}
      style={
        large && card?.editing?.aspect
          ? { aspectRatio: card.editing.aspect }
          : undefined
      }
    >
      {card?.thumbnail && !failed ? (
        <img
          src={card.thumbnail}
          alt={`${card.sourceName} 第 ${card.page} 页原始预览`}
          loading={large ? "eager" : "lazy"}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="mp-preview-missing">
          <Layers size={large ? 32 : 24} />
          <span>原始预览暂不可用</span>
          <small>可下载源 PPT 核查</small>
        </div>
      )}
    </div>
  );
}
function ReviewBadge({ card }) {
  const reviewed = ["已人工复核", "已视觉复核"].includes(card?.review?.status);
  return (
    <span className={`mp-review-badge ${reviewed ? "reviewed" : ""}`}>
      {reviewed ? <CheckCircle2 size={11} /> : <Eye size={11} />}{" "}
      {reviewLabel(card)}
    </span>
  );
}
function Colors({ visual }) {
  return (
    <div className="mp-color-list">
      {cleanArray(visual?.primaryColors).map((color, i) => (
        <span
          key={color.hex || i}
          title={`${color.name || ""} #${color.hex}`}
          style={{
            backgroundColor: /^[0-9a-f]{6}$/i.test(color.hex || "")
              ? "#" + color.hex
              : undefined,
          }}
        />
      ))}
      <small>{words(visual?.colorNames)}</small>
    </div>
  );
}
function DetailSection({ number, title, children }) {
  return (
    <section className="mp-detail-section">
      <h3>
        <span>{number}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
function Fact({ label, children }) {
  return (
    <div className="mp-fact">
      <dt>{label}</dt>
      <dd>{children ?? "待核查"}</dd>
    </div>
  );
}
function initialReview(card) {
  return {
    purpose: card.purpose?.main || "",
    logic: card.logic?.primary || "",
    moduleCount: card.structure?.moduleCount ?? "",
    modules: cleanArray(card.capacity?.modules).map((module) => ({
      id: module.id,
      min: module.bodyCapacity?.min ?? 0,
      max: module.bodyCapacity?.max ?? 0,
    })),
    confirmed: false,
  };
}
export function buildMaterialReviewChanges(form, original) {
  const changes = { purpose: form.purpose, logic: form.logic },
    modules = cleanArray(form.modules).map((module) => ({
      id: module.id,
      min: module.min === "" ? NaN : Number(module.min),
      max: module.max === "" ? NaN : Number(module.max),
    }));
  if (form.moduleCount !== "") {
    const number = Number(form.moduleCount);
    if (!Number.isInteger(number) || number < 1 || number > 50)
      throw new Error("一级模块数应为 1–50 的整数。");
    if (form.confirmed === true || number !== original?.structure?.moduleCount)
      changes.moduleCount = number;
  }
  if (
    modules.some(
      (module) =>
        !Number.isInteger(module.min) ||
        !Number.isInteger(module.max) ||
        module.min < 0 ||
        module.max < module.min ||
        module.max > 2000,
    )
  )
    throw new Error(
      "请填写有效的模块字数范围：0–2000 的整数，最多字数不能小于最少字数。",
    );
  const altered = modules.filter((module) => {
    const old = cleanArray(original?.capacity?.modules).find(
      (value) => value.id === module.id,
    );
    return (
      form.confirmed === true ||
      module.min !== (old?.bodyCapacity?.min ?? 0) ||
      module.max !== (old?.bodyCapacity?.max ?? 0)
    );
  });
  if (altered.length) changes.modules = altered;
  if (form.confirmed === true) changes.confirmed = true;
  return changes;
}

function MaterialDetails({
  card,
  meta,
  form,
  setForm,
  saving,
  error,
  onSave,
  onClose,
  onChoose,
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="mp-modal shadcn-material-details"
        showCloseButton={false}
      >
        <DialogDescription className="sr-only">
          原始素材预览、八维标签与人工复核。
        </DialogDescription>
        <header className="mp-modal-heading">
          <div>
            <span className="mp-kicker">单页素材档案</span>
            <DialogTitle asChild>
              <h2>{card?.name || "正在读取素材页"}</h2>
            </DialogTitle>
            {card && (
              <p>
                {card.sourceName} · 第 {card.page} 页 · {card.collection}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            className="mp-icon-button"
            aria-label="关闭素材详情"
            onClick={onClose}
          >
            <X size={20} />
          </Button>
        </header>
        {!card ? (
          <div className="mp-loading">
            <Loader2 className="spinning" size={20} />
            正在读取完整标签…
          </div>
        ) : (
          <>
            <div className="mp-detail-top">
              <div>
                <PagePreview card={card} large />
                <div className="mp-detail-source">
                  <ReviewBadge card={card} />
                  <a href={card.sourceUrl} className="mp-text-link">
                    <ArrowDownToLine size={13} />
                    下载原 PPT
                  </a>
                </div>
                <p className="mp-preview-disclosure">
                  预览来自原始
                  PPT；原生对象检查与逐图复核分开记录，未确认的字段继续保留待核查。
                </p>
                {card.review?.visualAudit&&<div className="mp-visual-evidence"><strong>图像复核依据</strong><p>{card.review.visualAudit.visualSummary}</p><p>可见文字：{card.review.visualAudit.observedText?.join('／')||'此页无可辨识文字'}</p>{card.review.visualAudit.unresolved?.length>0&&<p>待核查：{card.review.visualAudit.unresolved.join('；')}</p>}<small>图片已实际输入模型 · {card.review.visualAudit.model} · 原生字号与编辑性另行检查</small></div>}
              </div>
              <aside className="mp-detail-overview">
                <h3>这页能否直接用</h3>
                <strong className={canChoose(card) ? "ready" : "uncertain"}>
                  {card.match?.usable ||
                    (canChoose(card)
                      ? "可复用原生组件，填充后仍需文字检查"
                      : "暂不支持直接自动填充")}
                </strong>
                <p>{card.structure?.description || "页面结构待核查"}</p>
                <div className="mp-mini-tags">
                  <span>{card.purpose?.main || "用途待核查"}</span>
                  <span>{card.logic?.primary || "逻辑待核查"}</span>
                  <span>
                    {card.structure?.moduleCount ?? "待核查"} 个一级模块
                  </span>
                </div>
                <Colors visual={card.visual} />
                <p>
                  字体统一微软雅黑，优先沿用原素材字号与层级。默认保留素材原色。
                </p>
                {onChoose && (
                  <Button
                    variant="ghost"
                    className="mp-button primary"
                    disabled={!canChoose(card) || saving}
                    onClick={() => onChoose(card.defaultComponentId, card)}
                  >
                    <Check size={15} />
                    使用此页设计
                  </Button>
                )}
                {!canChoose(card) && (
                  <small>
                    此页仍可下载并作为元素参考；尚无可直接填充的完整组件。
                  </small>
                )}
              </aside>
            </div>
            <div className="mp-detail-dimensions">
              <DetailSection number="01" title="页面用途">
                <dl>
                  <Fact label="主要用途">{card.purpose?.main}</Fact>
                  <Fact label="其他用途">{words(card.purpose?.secondary)}</Fact>
                  <Fact label="判断依据">{card.purpose?.basis}</Fact>
                  <Fact label="标签置信度">{card.purpose?.confidence}</Fact>
                </dl>
              </DetailSection>
              <DetailSection number="02" title="表达逻辑">
                <dl>
                  <Fact label="主要逻辑">{card.logic?.primary}</Fact>
                  <Fact label="其他逻辑">{words(card.logic?.secondary)}</Fact>
                  <Fact label="判断依据">{card.logic?.basis}</Fact>
                  <Fact label="标签置信度">{card.logic?.confidence}</Fact>
                </dl>
              </DetailSection>
              <DetailSection number="03" title="结构与模块">
                <dl>
                  <Fact label="一级模块数">
                    {card.structure?.moduleCount ?? "待核查"}
                    {card.structure?.centerCount
                      ? `（另有 ${card.structure.centerCount} 个中心区）`
                      : ""}
                  </Fact>
                  <Fact label="空间排布">{card.structure?.layout}</Fact>
                  <Fact label="模块关系">{card.structure?.balance}</Fact>
                  <Fact label="数量可变性">{card.structure?.variability}</Fact>
                  <Fact label="图像 / 图表 / 表格位">
                    {card.structure?.imageSlots ?? 0} /{" "}
                    {card.structure?.chartSlots ?? 0} /{" "}
                    {card.structure?.tableSlots ?? 0}
                  </Fact>
                  <Fact label="识别依据">{card.structure?.countBasis}</Fact>
                </dl>
              </DetailSection>
              <DetailSection number="04" title="文字容量">
                <dl>
                  <Fact label="标题建议容量">
                    {rangeText(card.capacity?.title)}
                  </Fact>
                  <Fact label="全页正文建议容量">
                    {rangeText(card.capacity?.bodyTotal)}
                  </Fact>
                  <Fact label="原页正文实际字数">
                    {card.capacity?.originalBody?.characters ?? 0} 字
                  </Fact>
                  <Fact label="容量可信度">{card.capacity?.confidence}</Fact>
                  <Fact label="字体假设">{card.capacity?.fontAssumption}</Fact>
                </dl>
                <p className="mp-capacity-note">
                  {card.capacity?.warning ||
                    "字数范围为保守估算，不等同于原页实际字数。填充后仍需排版核查。"}
                </p>
              </DetailSection>
              <DetailSection number="05" title="适用场景">
                <dl>
                  <Fact label="汇报任务">
                    {words(card.scenario?.reportTasks)}
                  </Fact>
                  <Fact label="业务主题">
                    {words(card.scenario?.businessTopics)}
                  </Fact>
                  <Fact label="判断依据">{card.scenario?.basis}</Fact>
                </dl>
              </DetailSection>
              <DetailSection number="06" title="视觉风格">
                <dl>
                  <Fact label="风格初判">{card.visual?.style}</Fact>
                  <Fact label="原始主色">
                    <Colors visual={card.visual} />
                  </Fact>
                  <Fact label="背景类型">{card.visual?.background}</Fact>
                  <Fact label="图形形式">{words(card.visual?.forms)}</Fact>
                  <Fact label="源字体">{words(card.visual?.sourceFonts)}</Fact>
                  <Fact label="兼容套系">{card.visual?.compatibleSeries}</Fact>
                </dl>
              </DetailSection>
              <DetailSection number="07" title="编辑能力">
                <dl>
                  <Fact label="文字">
                    {yesNo(card.editing?.textEditable)} ·{" "}
                    {card.editing?.textObjects ?? 0} 个文字对象
                  </Fact>
                  <Fact label="图形">
                    {yesNo(card.editing?.graphicsEditable)} ·{" "}
                    {card.editing?.graphicsObjects ?? 0} 个原生图形
                  </Fact>
                  <Fact label="数据编辑">
                    {card.editing?.dataEditStatus ||
                      yesNo(card.editing?.dataEditable)}
                  </Fact>
                  <Fact label="原生图表 / 表格">
                    {card.editing?.nativeCharts ?? 0} /{" "}
                    {card.editing?.nativeTables ?? 0}
                  </Fact>
                  <Fact label="图片对象">
                    {card.editing?.imageObjects ?? 0} 个 ·
                    图片内文字不能直接编辑
                  </Fact>
                  <Fact label="动画">
                    {card.editing?.hasAnimation ? "含动画" : "未检测到动画"}
                  </Fact>
                  <Fact label="画布比例">
                    {card.editing?.aspect
                      ? `${card.editing.aspect} : 1`
                      : "待核查"}
                  </Fact>
                </dl>
              </DetailSection>
              <DetailSection number="08" title="复用条件">
                <dl>
                  <Fact label="自动填充支持">
                    {card.reuse?.generationReady
                      ? "已有完整组件绑定"
                      : "暂无完整组件绑定"}
                  </Fact>
                  <Fact label="需要调整">
                    {cleanArray(card.reuse?.adjustments).length
                      ? words(card.reuse.adjustments)
                      : "暂无结构级调整项；仍需检查实际填充效果"}
                  </Fact>
                  <Fact label="缺失资源">
                    {cleanArray(card.reuse?.missingResources).length
                      ? words(card.reuse.missingResources)
                      : "未检测到关联资源缺失"}
                  </Fact>
                  <Fact label="字体处理">{card.reuse?.missingFonts}</Fact>
                  <Fact label="授权状态">
                    {card.reuse?.authorization || "待核查"}
                  </Fact>
                  <Fact label="素材来源">{card.reuse?.source}</Fact>
                </dl>
              </DetailSection>
            </div>
            <section className="mp-module-section">
              <h3>逐模块容量对照</h3>
              <p>
                不同模块可能容纳不同字数。原页正文实际字数用于核查来源，不作为建议容量。
              </p>
              {cleanArray(card.capacity?.modules).length ? (
                <div className="mp-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>模块</th>
                        <th>模块标题建议</th>
                        <th>模块正文建议</th>
                        <th>原页实际正文</th>
                        <th>可信度</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.capacity.modules.map((module) => (
                        <tr key={module.id}>
                          <td>{module.id}</td>
                          <td>{rangeText(module.titleCapacity)}</td>
                          <td>{rangeText(module.bodyCapacity)}</td>
                          <td>{module.originalBody?.characters ?? 0} 字</td>
                          <td>{module.bodyCapacity?.confidence || "待核查"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mp-empty-inline">
                  尚未确认独立正文模块，请查看预览后判断。
                </p>
              )}
            </section>
            {form && (
              <form className="mp-review-form" onSubmit={onSave}>
                <div className="mp-review-heading">
                  <div>
                    <h3>复核并修正标签</h3>
                    <p>
                      自动分析不等同于人工复核。只有你勾选下方确认项后，才标记“已人工复核”。
                    </p>
                  </div>
                  <ReviewBadge card={card} />
                </div>
                <div className="mp-review-fields">
                  <label>
                    页面用途
                    <SelectField
                      value={form.purpose}
                      onChange={(event) =>
                        setForm({ ...form, purpose: event.target.value })
                      }
                    >
                      {cleanArray(meta.purposes).map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </SelectField>
                  </label>
                  <label>
                    表达逻辑
                    <SelectField
                      value={form.logic}
                      onChange={(event) =>
                        setForm({ ...form, logic: event.target.value })
                      }
                    >
                      {cleanArray(meta.logics).map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </SelectField>
                  </label>
                  <label>
                    一级模块数
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      step="1"
                      value={form.moduleCount}
                      placeholder="待核查"
                      onChange={(event) =>
                        setForm({ ...form, moduleCount: event.target.value })
                      }
                    />
                  </label>
                </div>
                {form.modules.length > 0 && (
                  <div className="mp-review-module-fields">
                    <div className="mp-module-field-header">
                      <span>模块正文容量</span>
                      <span>最少字数</span>
                      <span>最多字数</span>
                    </div>
                    {form.modules.map((module, index) => (
                      <div className="mp-module-field" key={module.id}>
                        <strong>{module.id}</strong>
                        <Input
                          type="number"
                          aria-label={`${module.id} 最少字数`}
                          min="0"
                          max="2000"
                          step="1"
                          value={module.min}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              modules: form.modules.map((value, i) =>
                                i === index
                                  ? { ...value, min: event.target.value }
                                  : value,
                              ),
                            })
                          }
                        />
                        <Input
                          type="number"
                          aria-label={`${module.id} 最多字数`}
                          min="0"
                          max="2000"
                          step="1"
                          value={module.max}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              modules: form.modules.map((value, i) =>
                                i === index
                                  ? { ...value, max: event.target.value }
                                  : value,
                              ),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
                <label className="mp-review-confirm">
                  <input
                    type="checkbox"
                    checked={form.confirmed}
                    onChange={(event) =>
                      setForm({ ...form, confirmed: event.target.checked })
                    }
                  />
                  <span>
                    我已查看本页预览，并核对用途、逻辑、一级模块数和各模块字数范围。
                  </span>
                </label>
                {error && (
                  <p className="mp-inline-error" role="alert">
                    <AlertCircle size={15} />
                    {error}
                  </p>
                )}
                <div className="mp-review-actions">
                  <span>
                    {form.confirmed
                      ? "保存后将标记为已人工复核"
                      : "未勾选时仅保存修改，不新增人工复核标记"}
                  </span>
                  <Button
                    variant="ghost"
                    className="mp-button primary"
                    disabled={saving}
                    type="submit"
                  >
                    {saving ? (
                      <Loader2 size={15} className="spinning" />
                    ) : (
                      <Check size={15} />
                    )}{" "}
                    {form.confirmed ? "保存并标记已复核" : "保存标签修改"}
                  </Button>
                </div>
              </form>
            )}
            <footer className="mp-detail-footer">
              <span>素材编号：{card.id}</span>
              <span>
                {card.tagging?.method || "原生结构自动分析"} ·{" "}
                {reviewLabel(card)}
              </span>
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function TaggedMaterialLibrary({ onChoose }) {
  const [selectedPages,setSelectedPages]=useState([]),[removed,setRemoved]=useState(false),[batchBusy,setBatchBusy]=useState(false);
  const [meta, setMeta] = useState({
      purposes: [],
      logics: [],
      sources: [],
      total: 0,
    }),
    [filters, setFilters] = useState(emptyFilters),
    [query, setQuery] = useState(""),
    [searchDraft, setSearchDraft] = useState(""),
    [page, setPage] = useState(1),
    [results, setResults] = useState({ items: [], total: 0, stats: {} }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0),
    [showAdvanced, setShowAdvanced] = useState(false),
    [detailId, setDetailId] = useState(""),
    [detail, setDetail] = useState(null),
    [form, setForm] = useState(null),
    [saving, setSaving] = useState(false),
    [reviewError, setReviewError] = useState(""),
    [rebuildJob, setRebuildJob] = useState(null),
    [starting, setStarting] = useState(false);
  useEffect(()=>{const imported=e=>{if(e.detail)setRebuildJob(e.detail);setRevision(n=>n+1);};window.addEventListener('yeyu-material-import',imported);return()=>window.removeEventListener('yeyu-material-import',imported);},[]);
  const currentDetailId = useRef(detailId);
  currentDetailId.current = detailId;
  const searchId = useId(),
    pageLimit = 24,
    totalPages = Math.max(1, Math.ceil(results.total / pageLimit));
  useEffect(() => {
    const controller = new AbortController();
    request("/api/material-pages/meta", { signal: controller.signal })
      .then(setMeta)
      .catch((problem) => {
        if (problem.name !== "AbortError") setError(problem.message);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const controller = new AbortController(),
      timer = setTimeout(() => {
        setLoading(true);
        setError("");
        const params = new URLSearchParams({
          page: String(page),
          limit: String(pageLimit),
        });
        if (removed)params.set("removed","1");
        if (query.trim()) params.set("q", query.trim());
        for (const [key, value] of Object.entries(filters))
          if (value !== "" && value !== false)
            params.set(key, value === true ? "1" : String(value));
        request("/api/material-pages?" + params, { signal: controller.signal })
          .then((result) => {
            setResults(result);
            if (page > Math.max(1, Math.ceil(result.total / pageLimit)))
              setPage(1);
          })
          .catch((problem) => {
            if (problem.name !== "AbortError") setError(problem.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, filters, page, revision,removed]);
  useEffect(() => {
    if (!detailId) return;
    const controller = new AbortController();
    setDetail(null);
    setForm(null);
    setReviewError("");
    request("/api/material-pages/" + encodeURIComponent(detailId), {
      signal: controller.signal,
    })
      .then((card) => {
        setDetail(card);
        setForm(initialReview(card));
      })
      .catch((problem) => {
        if (problem.name !== "AbortError") {
          setError(problem.message);
          setDetailId("");
        }
      });
    return () => controller.abort();
  }, [detailId]);
  useEffect(() => {
    if (!rebuildJob?.id || rebuildJob.status !== "running") return;
    let cancelled = false,
      timer,
      failures = 0;
    async function poll() {
      try {
        const next = await request("/api/material-pages/jobs/" + rebuildJob.id);
        if (cancelled) return;
        failures = 0;
        setRebuildJob(next);
        if (next.status === "done") {
          setRevision((value) => value + 1);
          setNotice("已完成逐页结构标注；新增自动标签仍待视觉复核。");
          return;
        }
        if (next.status === "failed") {
          setError(next.error || "标签解析未完成");
          return;
        }
      } catch (problem) {
        if (cancelled) return;
        failures++;
        if (failures >= 3) {
          setError("暂时无法读取标注进度：" + problem.message);
          setRebuildJob((previous) => ({ ...previous, status: "unavailable" }));
          return;
        }
      }
      timer = setTimeout(poll, failures ? 2500 : 1000);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rebuildJob?.id, rebuildJob?.status]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  function changeFilter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  }
  function search(event) {
    event.preventDefault();
    setQuery(searchDraft);
    setPage(1);
  }
  function reset() {
    setFilters(emptyFilters);
    setQuery("");
    setSearchDraft("");
    setPage(1);
  }
  async function rebuild() {
    setStarting(true);
    setError("");
    try {
      const job = await request("/api/material-pages/rebuild", {
        method: "POST",
      });
      setRebuildJob(job);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setStarting(false);
    }
  }
  async function saveReview(event) {
    event.preventDefault();
    if (!detail || !form || saving) return;
    const id = detail.id;
    let changes;
    try {
      changes = buildMaterialReviewChanges(form, detail);
    } catch (problem) {
      setReviewError(problem.message);
      return;
    }
    setSaving(true);
    setReviewError("");
    try {
      const updated = await request(
        "/api/material-pages/" + encodeURIComponent(id),
        { method: "PATCH", body: JSON.stringify(changes) },
      );
      if (currentDetailId.current === id) {
        setDetail(updated);
        setForm(initialReview(updated));
      }
      setRevision((value) => value + 1);
      setNotice(
        changes.confirmed
          ? "标签已保存，并按你的确认标记为已人工复核。"
          : "标签修改已保存，未新增人工复核标记。",
      );
    } catch (problem) {
      if (currentDetailId.current === id) setReviewError(problem.message);
      else setError(problem.message);
    } finally {
      setSaving(false);
    }
  }
  const closeDetail = React.useCallback(() => setDetailId(""), []),
    activeFilters = Object.values(filters).filter(
      (value) => value !== "" && value !== false,
    ).length;
  const requestTags = [
    results.request?.purpose,
    results.request?.logic,
    results.request?.moduleCount
      ? `${results.request.moduleCount} 个模块`
      : null,
    results.request?.perModuleChars
      ? `每模块 ${results.request.perModuleChars} 字`
      : null,
    ...cleanArray(results.request?.colors).map((color) => color + "色"),
  ].filter(Boolean);
  return (
    <section className="tagged-material-library" aria-label="单页素材标签库">
      <header className="mp-library-heading">
        <div>
          <span className="mp-kicker">原生 PPT · 逐页检索</span>
          <h2>按内容寻找合适的一页</h2>
          <p>先匹配用途、逻辑、模块数量与文字容量，再查看原始设计。</p>
        </div>
        <div className="mp-library-actions">
          <a className="mp-button" href="/api/material-pages/export?format=csv">
            <ArrowDownToLine size={14} />
            导出 CSV
          </a>
          <a
            className="mp-button"
            href="/api/material-pages/export?format=json"
          >
            <FileText size={14} />
            JSON
          </a>
          <Button
            variant="ghost"
            className="mp-button"
            disabled={starting || rebuildJob?.status === "running"}
            onClick={rebuild}
          >
            {starting || rebuildJob?.status === "running" ? (
              <Loader2 size={14} className="spinning" />
            ) : (
              <RefreshCw size={14} />
            )}
            重新解析标签
          </Button>
        </div>
      </header>
      <MaterialAuditProgress onUpdated={()=>setRevision(v=>v+1)}/>
      <div className="mp-stat-grid">
        <div>
          <strong>{results.stats?.total ?? meta.total ?? 0}</strong>
          <span>已建立标签的素材页</span>
        </div>
        <div>
          <strong>{results.stats?.library ?? "—"}</strong>
          <span>用户素材库</span>
        </div>
        <div>
          <strong>{results.stats?.reference ?? "—"}</strong>
          <span>效果参考页</span>
        </div>
        <div>
          <strong>{results.stats?.reviewed ?? "—"}</strong>
          <span>用户确认已人工复核</span>
        </div>
      </div>
      <p className="mp-auto-note">
        <Eye size={15} />
        <span>
          逐页记录图像复核状态；未确认字段保留待核查。原素材颜色保持不变，字体统一微软雅黑，保留源字号。
        </span>
      </p>
      {error && (
        <div className="mp-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <Button
            variant="ghost"
            className="mp-icon-button"
            aria-label="关闭错误"
            onClick={() => setError("")}
          >
            <X size={15} />
          </Button>
        </div>
      )}
      {notice && (
        <div className="mp-success" role="status">
          <CheckCircle2 size={16} />
          {notice}
        </div>
      )}
      {rebuildJob?.status === "running" && (
        <div className="mp-tagging-progress" role="status">
          <div>
            <Loader2 size={18} className="spinning" />
            <strong>正在逐页解析标签</strong>
            <span>
              {rebuildJob.completed || 0} / {rebuildJob.total || "待统计"} 页
            </span>
          </div>
          {rebuildJob.total > 0 ? (
            <progress
              value={rebuildJob.completed || 0}
              max={rebuildJob.total}
            />
          ) : (
            <progress />
          )}
          {rebuildJob.sourceName && (
            <small>
              {rebuildJob.sourceName} · 第 {rebuildJob.page} 页
            </small>
          )}
        </div>
      )}
      <section className="mp-search-panel">
        <form className="mp-search-form" onSubmit={search}>
          <label htmlFor={searchId} className="mp-search-box">
            <Search size={19} />
            <Input
              id={searchId}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="例如：党建汇报，三个并列模块，每项30字，蓝色，可编辑"
              aria-label="自然语言检索单页素材"
            />
          </label>
          <Button variant="ghost" className="mp-button primary" type="submit">
            查找素材
            <ArrowRight size={15} />
          </Button>
        </form>
        <div className="mp-query-examples">
          <span>试试：</span>
          {[
            "三个并列模块，每项30字",
            "蓝色可编辑流程说明",
            "成果展示，对比分析",
          ].map((example) => (
            <Button
              variant="ghost"
              key={example}
              onClick={() => {
                setSearchDraft(example);
                setQuery(example);
                setPage(1);
              }}
            >
              {example}
            </Button>
          ))}
        </div>
        <div className="mp-core-filters">
          <label>
            01 页面用途
            <SelectField
              value={filters.purpose}
              onChange={(event) => changeFilter("purpose", event.target.value)}
            >
              <option value="">全部用途</option>
              {cleanArray(meta.purposes).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </SelectField>
          </label>
          <label>
            02 表达逻辑
            <SelectField
              value={filters.logic}
              onChange={(event) => changeFilter("logic", event.target.value)}
            >
              <option value="">全部逻辑</option>
              {cleanArray(meta.logics).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </SelectField>
          </label>
          <label>
            03 一级模块数
            <SelectField
              value={filters.moduleCount}
              onChange={(event) =>
                changeFilter("moduleCount", event.target.value)
              }
            >
              <option value="">不限模块数</option>
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1} 个模块
                </option>
              ))}
            </SelectField>
          </label>
          <label>
            04 每模块正文需求
            <Input
              type="number"
              min="1"
              max="2000"
              step="1"
              value={filters.perModuleChars}
              onChange={(event) =>
                changeFilter("perModuleChars", event.target.value)
              }
              placeholder="例如：30 字"
            />
          </label>
        </div>
        <div className="mp-secondary-filters">
          <label>
            原有颜色
            <SelectField
              value={filters.color}
              onChange={(event) => changeFilter("color", event.target.value)}
            >
              <option value="">全部颜色</option>
              {["蓝", "红", "金", "绿", "橙", "黑", "白", "灰", "其他"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value === "其他" ? value : value + "色"}
                  </option>
                ),
              )}
            </SelectField>
          </label>
          <label className="mp-source-filter">
            素材来源
            <SelectField
              value={filters.sourceId}
              onChange={(event) => changeFilter("sourceId", event.target.value)}
            >
              <option value="">全部源文件</option>
              {cleanArray(meta.sources).map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </SelectField>
          </label>
          <label className="mp-editable-filter">
            <input
              type="checkbox"
              checked={filters.editable}
              onChange={(event) =>
                changeFilter("editable", event.target.checked)
              }
            />
            <span>文字和图形均可编辑</span>
          </label>
          <Button
            variant="ghost"
            className={`mp-more-filters ${showAdvanced ? "active" : ""}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <Filter size={13} />
            更多筛选{activeFilters > 0 && <span>{activeFilters}</span>}
            <ChevronDown size={13} />
          </Button>
        </div>
        {showAdvanced && (
          <div className="mp-advanced-filters">
            <label>
              复核状态
              <SelectField
                value={filters.review}
                onChange={(event) => changeFilter("review", event.target.value)}
              >
                <option value="">全部状态</option>
                <option>待视觉复核</option>
                <option>已视觉复核</option>
                <option>已人工复核</option>
              </SelectField>
            </label>
            <label>
              业务主题
              <SelectField
                value={filters.topic}
                onChange={(event) => changeFilter("topic", event.target.value)}
              >
                <option value="">全部主题</option>
                {topics.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </SelectField>
            </label>
            <label>
              素材集合
              <SelectField
                value={filters.collection}
                onChange={(event) =>
                  changeFilter("collection", event.target.value)
                }
              >
                <option value="">全部集合</option>
                <option>用户素材库</option>
                <option>效果参考</option>
              </SelectField>
            </label>
          </div>
        )}
      </section>
      <div className="selection-actionbar material-batch-actions"><label><input type="checkbox" aria-label="全选本页素材" checked={results.items.length>0&&results.items.every(p=>selectedPages.includes(p.id))} onChange={e=>setSelectedPages(e.target.checked?results.items.map(p=>p.id):[])}/>全选本页</label><span>已选 {selectedPages.length} 项</span><Button variant="outline" disabled={!selectedPages.length||batchBusy} onClick={async()=>{setBatchBusy(true);try{await request("/api/material-pages/batch-delete",{method:"POST",body:JSON.stringify({ids:selectedPages,restore:removed})});setSelectedPages([]);setRevision(n=>n+1);}catch(e){setError(e.message);}finally{setBatchBusy(false);}}}>{removed?"恢复所选":"删除所选"}</Button><Button variant="ghost" onClick={()=>{setRemoved(v=>!v);setSelectedPages([]);setPage(1);}}>{removed?"返回素材库":"已移除素材"}</Button></div>
      <div className="mp-results-heading">
        <div>
          <strong>
            {loading
              ? "正在匹配…"
              : `${results.total.toLocaleString()} 页匹配素材`}
          </strong>
          {query && <span>检索：{query}</span>}
        </div>
        {(query || activeFilters > 0) && (
          <Button variant="ghost" className="mp-text-link" onClick={reset}>
            <X size={13} />
            清空检索与筛选
          </Button>
        )}
      </div>
      {requestTags.length > 0 && (
        <div className="mp-parsed-query">
          <span>识别到的需求</span>
          {requestTags.map((tag, index) => (
            <strong key={tag + index}>{tag}</strong>
          ))}
        </div>
      )}
      {loading ? (
        <div className="mp-loading">
          <Loader2 size={22} className="spinning" />
          <span>正在匹配逐页标签…</span>
        </div>
      ) : results.items.length === 0 ? (
        <div className="mp-empty">
          <Search size={32} />
          <h3>暂未找到符合条件的素材页</h3>
          <p>
            {meta.total
              ? "可以放宽模块数、文字容量或配色筛选，再查看原始预览。"
              : "点击“重新解析标签”，为本机已导入的 PPT 建立逐页标签。"}
          </p>
          {activeFilters > 0 && (
            <Button variant="ghost" className="mp-button" onClick={reset}>
              清空筛选
            </Button>
          )}
        </div>
      ) : (
        <div className="mp-page-grid">
          {results.items.map((card) => (
            <article className="mp-page-card" key={card.id}><label className="item-select-checkbox"><input type="checkbox" aria-label={'选择素材'+card.sourceName+'第'+card.page+'页'} checked={selectedPages.includes(card.id)} onChange={e=>setSelectedPages(old=>e.target.checked?[...old,card.id]:old.filter(id=>id!==card.id))}/></label>
              <Button
                variant="ghost"
                className="mp-preview-button"
                onClick={() => setDetailId(card.id)}
                aria-label={`查看 ${card.sourceName} 第 ${card.page} 页的8维标签`}
              >
                <PagePreview card={card} />
                <span className="mp-source-page">
                  {card.collection === "效果参考" ? "参考 · " : ""}第{" "}
                  {card.page} 页
                </span>
              </Button>
              <div className="mp-card-body">
                <div className="mp-card-title">
                  <h3 title={card.name}>{card.name}</h3>
                  <ReviewBadge card={card} />
                </div>
                <p className="mp-source-name" title={card.sourceName}>
                  {card.sourceName}
                </p>
                <div className="mp-mini-tags">
                  <span>{card.purpose?.main || "用途待核查"}</span>
                  <span>{card.logic?.primary || "逻辑待核查"}</span>
                  <span>{card.structure?.moduleCount ?? "待核查"} 个模块</span>
                </div>
                <p className="mp-card-capacity">
                  正文建议 {rangeText(card.capacity?.bodyTotal)}
                  <span>
                    容量可信度：{card.capacity?.confidence || "待核查"}
                  </span>
                </p>
                <Colors visual={card.visual} />
                <div className="mp-card-match">
                  <strong>
                    {card.match?.usable ||
                      (canChoose(card)
                        ? "支持原生组件复用"
                        : "暂不支持直接自动填充")}
                  </strong>
                  {cleanArray(card.match?.reasons).length > 0 && (
                    <p>
                      <Check size={12} />
                      {card.match.reasons.join(" · ")}
                    </p>
                  )}
                  {cleanArray(card.match?.adjustments).length > 0 && (
                    <details>
                      <summary>
                        需调整 / 核查 {card.match.adjustments.length} 项
                      </summary>
                      <ul>
                        {card.match.adjustments.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="mp-card-actions">
                  <Button
                    variant="ghost"
                    className="mp-button"
                    onClick={() => setDetailId(card.id)}
                  >
                    <Eye size={13} />
                    查看8维标签
                  </Button>
                  {onChoose ? (
                    <Button
                      variant="ghost"
                      className="mp-button primary"
                      disabled={!canChoose(card)}
                      onClick={() => onChoose(card.defaultComponentId, card)}
                      title={
                        !canChoose(card)
                          ? "暂无可直接填充的完整组件"
                          : undefined
                      }
                    >
                      使用此页
                      <ArrowRight size={13} />
                    </Button>
                  ) : (
                    <a
                      className="mp-source-link"
                      href={card.sourceUrl}
                      title="下载完整源 PPT"
                    >
                      <ExternalLink size={13} />
                      源文件
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="mp-pagination">
        <Button
          variant="ghost"
          className="mp-button"
          disabled={loading || page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          <ArrowLeft size={14} />
          上一页
        </Button>
        <span>
          第 {page} / {totalPages} 页 · 每页 {pageLimit} 项
        </span>
        <Button
          variant="ghost"
          className="mp-button"
          disabled={loading || page >= totalPages}
          onClick={() => setPage((value) => value + 1)}
        >
          下一页
          <ArrowRight size={14} />
        </Button>
      </div>
      {detailId && (
        <MaterialDetails
          card={detail}
          meta={meta}
          form={form}
          setForm={setForm}
          saving={saving}
          error={reviewError}
          onSave={saveReview}
          onClose={closeDetail}
          onChoose={onChoose}
        />
      )}
    </section>
  );
}
