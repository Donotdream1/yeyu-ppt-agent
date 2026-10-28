import React from "react";
import {
  Upload,
  FileText,
  LayoutTemplate,
  Check,
  ArrowRight,
  ChartNoAxesCombined,
  SlidersHorizontal,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Field, FormSelect } from "./forms";
import { preparationIssues } from "@/lib/journey";

export default function Preparation({ s, onPlan, onSettings }) {
  const issues = preparationIssues(s),
    disabled = Boolean(s.busy);
  return (
    <div className="preparation-grid">
      <div className="preparation-main">
        <Card>
          <CardHeader>
            <div className="section-title">
              <span className="section-icon">
                <FileText size={19} />
              </span>
              <div>
                <CardTitle>这次准备讲什么？</CardTitle>
                <CardDescription>
                  提供一份文档，系统会组织每页内容，无需逐页填写。
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={s.document ? "paste" : "upload"}>
              <TabsList>
                <TabsTrigger value="upload">上传文档</TabsTrigger>
                <TabsTrigger value="paste">粘贴内容</TabsTrigger>
              </TabsList>
              <TabsContent value="upload">
                <button
                  type="button"
                  className="document-drop"
                  disabled={disabled}
                  onClick={() => s.docInput.current.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!disabled) s.uploadDoc(e.dataTransfer.files[0]);
                  }}
                >
                  <span className="upload-orb">
                    <Upload size={24} />
                  </span>
                  <strong>{s.docName || "把文档拖到这里，或点击上传"}</strong>
                  <span>支持 DOCX、PDF、TXT、Markdown</span>
                  <small>系统读取内容后，自动规划页数、主题与素材布局</small>
                </button>
              </TabsContent>
              <TabsContent value="paste">
                <Textarea
                  aria-label="文档内容"
                  placeholder="粘贴你的汇报、研究或培训文档。重要事实、数据和来源请一并提供。"
                  className="document-input"
                  maxLength={250000}
                  value={s.document}
                  onChange={(e) => s.setDocument(e.target.value)}
                  disabled={disabled}
                />
              </TabsContent>
            </Tabs>
            <div className="document-meta">
              <span>
                {s.document ? (
                  <>
                    <Check size={14} />
                    {s.document.length.toLocaleString()} 字已就绪
                  </>
                ) : (
                  "尚未添加文档"
                )}
              </span>
              <span>草稿自动保存在当前浏览器</span>
            </div>
            {s.document && (
              <Accordion type="single" collapsible>
                <AccordionItem value="content">
                  <AccordionTrigger>查看与编辑已读取的内容</AccordionTrigger>
                  <AccordionContent>
                    <Textarea
                      aria-label="已读取的文档内容"
                      className="document-input"
                      value={s.document}
                      onChange={(e) => s.setDocument(e.target.value)}
                      disabled={disabled}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>说明汇报需求</CardTitle>
            <CardDescription>
              明确对象和目标，内容与表达才能更贴切。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset disabled={disabled} className="form-stack">
              <Field
                label="演示标题"
                htmlFor="presentation-title"
                hint="留空时，根据文档自动拟定。"
              >
                <Input
                  id="presentation-title"
                  value={s.title}
                  onChange={(e) => s.setTitle(e.target.value)}
                  placeholder="例如：生产经营协同工作汇报"
                  maxLength={100}
                />
              </Field>
              <div className="form-two">
                <Field label="汇报对象" htmlFor="audience">
                  <FormSelect
                    id="audience"
                    value={s.audience}
                    onChange={(e) => s.setAudience(e.target.value)}
                  >
                    {[
                      "管理层",
                      "团队同事",
                      "专家评审",
                      "客户 / 合作伙伴",
                      "培训学员",
                      "公众",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </FormSelect>
                </Field>
                <Field label="生成页数" htmlFor="page-count">
                  <FormSelect
                    id="page-count"
                    value={s.pageCount}
                    onChange={(e) => s.setPageCount(+e.target.value)}
                  >
                    <option value={0}>自动规划</option>
                    {Array.from({ length: 28 }, (_, i) => i + 3).map((n) => (
                      <option value={n} key={n}>
                        {n} 页（含封面与结尾）
                      </option>
                    ))}
                  </FormSelect>
                </Field>
              </div>
              <Field label="希望重点呈现的内容" htmlFor="requirements">
                <Textarea
                  id="requirements"
                  value={s.requirements}
                  onChange={(e) => s.setRequirements(e.target.value)}
                  placeholder="例如：重点展示三项工作成果，说明问题与下一步安排；适合向领导汇报。"
                  maxLength={10000}
                />
              </Field>
              <Accordion type="multiple">
                <AccordionItem value="chart">
                  <AccordionTrigger>
                    <span className="inline-label">
                      <ChartNoAxesCombined size={16} />
                      图表与数据 <span className="muted">可选</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="form-stack">
                      <Textarea
                        aria-label="图表展示需求"
                        value={s.chartRequest}
                        onChange={(e) => s.setChartRequest(e.target.value)}
                        placeholder="例如：对比各产线质量改善前后的合格率，数据见附件。"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => s.dataInput.current.click()}
                      >
                        <Upload />
                        上传数据文件
                      </Button>
                      <small className="muted">
                        CSV、TSV、JSON、XLSX；无真实数据时不会编造统计结果。
                      </small>
                      {s.dataFiles.map((f) => (
                        <div className="attachment" key={f.sha256 || f.name}>
                          <FileText size={16} />
                          <span>{f.name}</span>
                          <Badge variant="secondary">{f.records} 条记录</Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              s.setDataFiles(s.dataFiles.filter((v) => v !== f))
                            }
                          >
                            移除
                          </Button>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="advanced">
                  <AccordionTrigger>
                    <span className="inline-label">
                      <SlidersHorizontal size={16} />
                      高级生成选项
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="form-stack">
                      <Field label="页面风格" htmlFor="design-profile">
                        <FormSelect
                          id="design-profile"
                          value={s.designProfile}
                          onChange={(e) => s.setDesignProfile(e.target.value)}
                        >
                          <option value="auto">根据文档自动判断</option>
                          <option value="material">素材原生布局</option>
                          <option value="research-defense">
                            科研答辩参考骨架
                          </option>
                        </FormSelect>
                      </Field>
                      <Field label="配色依据" htmlFor="palette-mode">
                        <FormSelect
                          id="palette-mode"
                          value={s.paletteMode}
                          onChange={(e) => s.setPaletteMode(e.target.value)}
                        >
                          <option value="material">
                            保留所选素材原色（默认）
                          </option>
                          <option value="user">使用我明确指定的颜色</option>
                          <option value="template">使用用户模板主题色</option>
                        </FormSelect>
                      </Field>
                      <Field label="优先素材套系" htmlFor="palette-source">
                        <FormSelect
                          id="palette-source"
                          value={s.paletteSourceId}
                          onChange={(e) => s.setPaletteSourceId(e.target.value)}
                        >
                          <option value="">根据文档选择合适素材</option>
                          {s.designOptions.sources?.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </FormSelect>
                      </Field>
                      {s.paletteMode === "user" && (
                        <div className="color-inputs">
                          {Object.entries(s.userColors).map(([k, v]) => (
                            <label key={k}>
                              {
                                {
                                  primary: "主色",
                                  bar: "标题条",
                                  surface: "浅背景",
                                  border: "边框",
                                  text: "正文",
                                  accent: "强调色",
                                }[k]
                              }
                              <Input
                                type="color"
                                aria-label={k + "颜色"}
                                value={"#" + v}
                                onChange={(e) =>
                                  s.setUserColors({
                                    ...s.userColors,
                                    [k]: e.target.value.slice(1),
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                      )}
                      <Field label="机构名称" htmlFor="institution">
                        <Input
                          id="institution"
                          value={s.institutionName}
                          onChange={(e) => s.setInstitutionName(e.target.value)}
                          placeholder="使用模板已有Logo；仅填写真实机构"
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => s.referenceInput.current.click()}
                      >
                        <Upload />
                        上传效果参考 PPT
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </fieldset>
          </CardContent>
        </Card>
      </div>
      <aside className="preparation-aside">
        <Card className="template-selection">
          <CardHeader>
            <div className="section-title">
              <LayoutTemplate size={19} />
              <CardTitle>选择输出模板</CardTitle>
            </div>
            <CardDescription>保留你的封面、Logo和页眉底稿。</CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset disabled={disabled} className="form-stack">
              {s.template ? (
                <img
                  className="template-hero-preview"
                  src={s.template.pages?.[0]?.thumbnail}
                  alt={s.template.name + "封面预览"}
                />
              ) : (
                <div className="template-empty">
                  <LayoutTemplate size={34} />
                  <p>添加你的 PPT 模板</p>
                </div>
              )}
              <Field label="当前模板" htmlFor="template-choice">
                <FormSelect
                  id="template-choice"
                  value={s.templateId}
                  onChange={(e) => s.setTemplateId(e.target.value)}
                >
                  <option value="">请选择模板</option>
                  {s.studio.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </FormSelect>
              </Field>
              <Button
                type="button"
                variant="outline"
                onClick={() => s.templateInput.current.click()}
              >
                <Upload />
                上传或替换模板
              </Button>
              <div className="template-promise">
                <p>
                  <Check size={14} />
                  中文字体统一微软雅黑
                </p>
                <p>
                  <Check size={14} />
                  沿用素材配色，检查字号层级
                </p>
                <p>
                  <Check size={14} />
                  图形、文字保持原生可编辑
                </p>
              </div>
            </fieldset>
          </CardContent>
        </Card>
        <Card className="next-step-card">
          <CardContent>
            <span className="small-kicker">下一步</span>
            <h3>先看方案，再制作页面</h3>
            <p>查看每页主题、要点和布局方向，确认后再生成完整PPT。</p>
            <div className="readiness-list">
              {issues.length ? (
                issues.map((x) => <p key={x}>{x}</p>)
              ) : (
                <p className="ready-note">
                  <Check size={14} />
                  文档、模板与模型已就绪
                </p>
              )}
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={disabled || issues.length > 0}
              onClick={onPlan}
            >
              生成逐页方案
              <ArrowRight />
            </Button>
            {!s.studio.hasKey && !s.apiKey && (
              <Button variant="link" onClick={onSettings}>
                配置模型连接
              </Button>
            )}
          </CardContent>
        </Card>
        <p className="sidebar-help">
          <FolderOpen size={15} />
          素材库会按每页内容自动匹配，不需要先逐个挑选素材。
        </p>
      </aside>
    </div>
  );
}
