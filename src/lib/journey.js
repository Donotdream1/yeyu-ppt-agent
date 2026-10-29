export const journeySteps = [
  { id: "prepare", title: "准备资料", description: "文档与用户模板" },
  { id: "outline", title: "确认方案", description: "逐页主题与内容结构" },
  { id: "generate", title: "制作页面", description: "选材、填充与检查" },
  { id: "review", title: "预览导出", description: "逐页换版与下载" },
];
export function preparationKey(value) {
  return JSON.stringify({
    document: value.document,
    inputMode:value.inputMode||'document',
    title: value.title,
    requirements: value.requirements,
    audience: value.audience,
    pageCount: value.pageCount,
    layoutDensity: value.layoutDensity,
    templateId: value.templateId,
    designProfile: value.designProfile,
    paletteMode: value.paletteMode,
    paletteSourceId: value.paletteSourceId,
    userColors: value.paletteMode === "user" ? value.userColors : undefined,
    chartRequest: value.chartRequest,
    presentationPrompt: value.presentationPrompt,
    chartPrompt: value.chartPrompt,
    referenceId: value.studio?.referenceId,
    dataFiles: (value.dataFiles || []).map((f) => f.sha256 || f.name),
  });
}
export function preparationIssues(value) {
  const issues = [];
  if (String(value.document || "").trim().length < (value.inputMode==="topic"?2:20))
    issues.push(value.inputMode==="topic"?"请输入至少2字的演示主题":"请上传文档，或粘贴至少20字的内容");
  if (!value.templateId) issues.push("请选择用于输出的PPT模板");
  if (!value.apiKey && !value.studio?.hasKey)
    issues.push("请在模型设置中添加并启用模型连接");
  return issues;
}
