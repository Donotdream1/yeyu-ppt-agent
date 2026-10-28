import React from "react";
import {
  Upload,
  FolderOpen,
  Check,
  LayoutTemplate,
  ArrowRight,
  Save,
  BookOpen,
  ChartNoAxesCombined,
  Layers,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field } from "./forms";
import { post } from "@/lib/api";
import SlideImage from "./SlideImage";
import SkillCenter from "@/SkillCenter";

export function Templates({ s }) {
  return (
    <div>
      <Card className="resource-import">
        <CardHeader>
          <CardTitle>把常用模板准备好</CardTitle>
          <CardDescription>
            模板负责封面、Logo和页眉底稿；素材库负责每页的内容设计。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="inline-controls">
            <Input
              aria-label="模板本地路径"
              placeholder="粘贴本地PPTX文件路径"
              value={s.templatePath}
              onChange={(e) => s.setTemplatePath(e.target.value)}
              disabled={!!s.busy}
            />
            <Button
              variant="outline"
              disabled={!!s.busy || !s.templatePath.trim()}
              onClick={() =>
                s.run("正在读取用户模板", async () => {
                  const t = await post("/api/templates/path", {
                    path: s.templatePath,
                  });
                  await s.refresh();
                  s.setTemplateId(t.id);
                  s.setToast("模板已添加，可用于下一次制作");
                })
              }
            >
              <FolderOpen />
              从路径导入
            </Button>
            <Button
              disabled={!!s.busy}
              onClick={() => s.templateInput.current.click()}
            >
              <Upload />
              上传模板
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="template-grid">
        {s.studio.templates.map((t) => (
          <Card
            className={
              s.templateId === t.id ? "template-card selected" : "template-card"
            }
            key={t.id}
          >
            <SlideImage
              className="template-cover"
              src={t.pages?.[0]?.thumbnail}
              alt={t.name}
            />
            <CardContent>
              <div className="history-card-heading">
                <h3>{t.name}</h3>
                {s.templateId === t.id && (
                  <Badge>
                    <Check size={12} />
                    已选择
                  </Badge>
                )}
              </div>
              <p>{t.pages?.length || 0} 页底稿 · 原生 PPT 模板</p>
              <div className="template-mini-pages">
                {t.pages?.slice(1, 4).map((p, i) => (
                  <SlideImage
                    key={i}
                    src={p.thumbnail}
                    alt={`${t.name}第${i + 2}页`}
                  />
                ))}
              </div>
              <Button
                variant={s.templateId === t.id ? "secondary" : "outline"}
                disabled={!!s.busy}
                className="w-full"
                onClick={() => {
                  s.setTemplateId(t.id);
                  s.setToast("已选择模板，返回创作工作台后使用");
                }}
              >
                {s.templateId === t.id ? <Check /> : <LayoutTemplate />}
                {s.templateId === t.id ? "当前已选择" : "选择此模板"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {s.output && s.templateId !== s.plan?.templateId && (
        <div className="workflow-bottom">
          <span>当前作品仍使用原来的模板。确认后可重新套用所选模板。</span>
          <Button disabled={!!s.busy} onClick={s.applyTemplate}>
            应用到当前作品
            <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}

export function Rules({ s }) {
  return (
    <Tabs value={s.tab} onValueChange={s.setTab} className="rules-tabs">
      <TabsList>
        <TabsTrigger value="rules">
          <BookOpen size={15} />
          PPT撰写规则
        </TabsTrigger>
        <TabsTrigger value="charts">
          <ChartNoAxesCombined size={15} />
          图表规范
        </TabsTrigger>
        <TabsTrigger value="skills">
          <Layers size={15} />
          技能配置
        </TabsTrigger>
      </TabsList>
      <TabsContent value="rules">
        <Card>
          <CardHeader>
            <CardTitle>文档分析与PPT撰写提示词</CardTitle>
            <CardDescription>
              用于内容规划与素材文案适配。保存后对下一次制作生效。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              className="rules-editor"
              aria-label="PPT撰写提示词"
              maxLength={40000}
              value={s.presentationPrompt}
              onChange={(e) => s.setPresentationPrompt(e.target.value)}
            />
            <div className="editor-footer">
              <span>{s.presentationPrompt.length.toLocaleString()} 字</span>
              <Button
                disabled={!!s.busy}
                onClick={() =>
                  s.run("正在保存撰写规则", async () => {
                    await post("/api/presentation-prompt", {
                      prompt: s.presentationPrompt,
                    });
                    await s.refresh();
                    s.setToast("PPT撰写规则已保存");
                  })
                }
              >
                <Save />
                保存撰写规则
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="charts">
        <Card>
          <CardHeader>
            <CardTitle>图表绘制与数据核查提示词</CardTitle>
            <CardDescription>
              约束统计口径、来源、图表与可编辑数据；不编造缺失数值。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              className="rules-editor"
              aria-label="图表绘制提示词"
              maxLength={25000}
              value={s.chartPrompt}
              onChange={(e) => s.setChartPrompt(e.target.value)}
            />
            <div className="editor-footer">
              <span>{s.chartPrompt.length.toLocaleString()} 字</span>
              <Button
                disabled={!!s.busy}
                onClick={() =>
                  s.run("正在保存图表规范", async () => {
                    await post("/api/chart-prompt", { prompt: s.chartPrompt });
                    await s.refresh();
                    s.setToast("图表规范已保存");
                  })
                }
              >
                <Save />
                保存图表规范
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="skills">
        <SkillCenter trace={s.plan?.agentTrace || []} onRules={s.setTab} />
      </TabsContent>
    </Tabs>
  );
}

export function ModelSettings({ s }) {
  return (
    <Dialog open={s.settings} onOpenChange={s.setSettings}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>DeepSeek 模型设置</DialogTitle>
          <DialogDescription>
            沿用服务端配置，也可以为本次会话指定Key和模型。
          </DialogDescription>
        </DialogHeader>
        <div className="form-stack">
          <Field label="连接状态">
            <Badge
              variant={s.studio.hasKey || s.apiKey ? "secondary" : "outline"}
            >
              {s.studio.hasKey
                ? "服务端已配置 API Key"
                : s.apiKey
                  ? "已填写本次会话Key"
                  : "尚未配置 API Key"}
            </Badge>
          </Field>
          <Field
            label="API Key"
            htmlFor="api-key"
            hint="仅用于当前会话，不写入浏览器草稿。"
          >
            <Input
              type="password"
              id="api-key"
              autoComplete="off"
              value={s.apiKey}
              onChange={(e) => s.setApiKey(e.target.value)}
              placeholder={
                s.studio.hasKey
                  ? "留空即可使用服务端配置"
                  : "请输入DeepSeek API Key"
              }
            />
          </Field>
          <Field label="模型名称" htmlFor="model-name">
            <Input
              id="model-name"
              value={s.model}
              onChange={(e) => s.setModel(e.target.value)}
              placeholder="使用当前DeepSeek服务支持的模型名称"
            />
          </Field>
          <p className="field-hint">
            制作过程由 Hermes 调用专业技能，模型负责内容理解、选版与文案适配。
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => s.setSettings(false)}>
            关闭
          </Button>
          <Button
            disabled={!s.model.trim()}
            onClick={() => {
              s.setSettings(false);
              s.setToast("本次会话的模型配置已更新");
            }}
          >
            使用此配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
