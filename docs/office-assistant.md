# 办公助理与GitHub Skills

总入口：`/workbench`。PPT与六类办公能力并列，共七类；PPT沿用`/workspace`，六个办公能力有独立`/office/<能力>`地址。`/office`保留组合视图。所有能力统一复用现有登录账号和个人模型连接；AI处理通过 `runHermes` → 项目Python适配器 → Hermes `AIAgent` 调用模型。没有另外绕过Hermes的聊天模型客户端。语音识别、邮件协议、XLSX处理是确定性工具，模型只提交受校验的数据。

职责、模拟场景与实际验收记录见[七能力模拟验收](office-verification.md)。

## 六类能力

| 能力 | 操作路径 | 结果 |
| --- | --- | --- |
| 高频办公 | 办公撰写 → 选择通知/邮件/汇总/收集说明 → 输入事实 → 生成 | 可编辑草稿、Word/Markdown；邮件必须核对收件人并确认发送 |
| 团队任务 | 创建团队 → 邀请已注册账号 → 创建需求/任务 → 分配负责人、期限与进度 | 五列看板、活动记录、临期/逾期站内提醒 |
| 多源信息 | 导入EML/DOCX/文本PDF/TXT/MD，或粘贴原文、同步IMAP邮箱 | 按原文生成摘要、关键词、行动项并归档，支持搜索 |
| 语音与会议 | 实时听写/录音上传/粘贴转写 → 校正 → Hermes纪要或任务候选 | 原文转写、纪要、可确认后加入需求池的任务 |
| Excel/WPS | 上传XLSX/CSV → 选工作表 → 自然语言描述 → 检查方案 → 执行 | 整理、去重、筛选、排序、公式新列、分组/交叉汇总、新XLSX |
| 可研与需求 | 上传/粘贴完整原文 → 输入评审重点 → 生成报告 | 六维辅助评分、可定位原文证据、缺项与建议、Word报告 |

跨部门收集位于团队看板：创建字段（文本/数字/日期、单位）、设置截止时间，成员按部门填报，创建者下载汇总XLSX。每个账号保留一份最新填报，数据类型由服务端检查。

## 固定版本的GitHub Skill

| 能力/本地技能 | 原作 | 固定提交 | 许可 |
| --- | --- | --- | --- |
| `office-writing` | [Email Drafter](https://github.com/xcrrr/claude-skills/blob/145342ceff6318d2f5ffe8f95473fecc8b27d1e9/skills/writing/email-drafter/SKILL.md) | `145342ce` | MIT |
| `office-tasks` | [Task Planner](https://github.com/xcrrr/claude-skills/blob/145342ceff6318d2f5ffe8f95473fecc8b27d1e9/skills/productivity/task-planner/SKILL.md) | `145342ce` | MIT |
| `office-summary` | [Summarizer](https://github.com/xcrrr/claude-skills/blob/145342ceff6318d2f5ffe8f95473fecc8b27d1e9/skills/research/summarizer/SKILL.md) | `145342ce` | MIT |
| `office-meeting` | [PM Meeting Notes](https://github.com/shangbianai/pm-meeting-notes/blob/198052ce157fff377c5fd7423e700103a7a84a4b/SKILL.md) | `198052ce` | MIT |
| `office-spreadsheets` | [MiniMax XLSX](https://github.com/MiniMax-AI/skills/blob/60aaae52bb2af8162732751a4332f62a5fef518b/skills/minimax-xlsx/SKILL.md) | `60aaae52` | MIT |
| `project-review` | [Architecture Review / Microsoft HVE](https://github.com/microsoft/hve-core/blob/f2bc028c2a0c4ba8a693c35387c7afbfb20c1620/.github/skills/project-planning/architecture-review/SKILL.md) | `f2bc028c` | **CC BY 4.0**，按文件声明，不按根目录MIT推断 |

六份原文快照及上游根许可证保存在 `agents/vendor/office-skills/`。实际加载的是 `agents/skills/<name>/SKILL.md` 和同目录 `references/github.md` 的本地适配，记录了采用方法、原作者、版本与变更。原版参考中的外部CLI、脚本、菜单、自动分配和全格式回写不会自动执行。微软技能的CC BY署名、许可URL及本地修改说明单独保留；本地六维分数不是微软官方评分方法。

设置 → 技能与规则可查看和修改本地技能。办公页的Skills卡片可查看来源，Hermes工作台的“办公任务”显示实际模型请求、工具事件、技能版本和状态，不展示模型私有思维链。

## 连接与使用边界

- 所有连接在设置 → 模型统一管理。邮箱和语音凭据按账号用AES-256-GCM加密，接口不返回明文。备份时需同时保留 `data/office/connection-key` 与密文；不提交Git。
- 邮箱使用TLS IMAP 993、SMTP 465或STARTTLS 587，需邮箱服务商应用授权码。只读同步最近20封，不标已读，不处理邮件附件。自动同步每5分钟，自动摘要为单独开关；启用摘要会将邮件原文交给该账号的模型服务。
- 发送邮件需明确收件人、保存正文并勾选确认；重复相同版本拦截。SMTP连接中断时不能证明是否送达，先核对服务商发件记录再操作。站内自动催办不自动发邮件。
- 语音可接Whisper兼容的完整转写接口或本地 [whisper.cpp server](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server)。不自带模型权重，不默认调用第三方语音服务。浏览器实时听写是否可用取决于浏览器及其识别服务；录音需要localhost或HTTPS，普通局域网HTTP可上传已有录音。没有承诺离线听写或说话人分离。
- 表格处理以数据提取后生成**新结果工作簿**为范围，保留原文件，不做原格式无损编辑；原文件中的图表、宏、透视对象、样式不会随结果自动保留。拒绝宏和外部链接。支持`.xlsx/.csv`，不支持旧`.xls`。每个工作簿最多2万行、100列、20万单元格、解压40MB。
- 公式限定常用当前表函数，不允许外部引用、网络函数、任意Python/JavaScript/SQL。服务端不会计算公式缓存，Excel/WPS打开后重算；未算得的值不冒充真实结果。分组与交叉汇总直接计算真实数据，遇到非数值或空值需要先清理或选择计数。
- 评审6维权重20/20/20/15/15/10；每维0–4级，程序根据权重算总分。模型引用不能在原文逐字定位时，该维计0分。结果是辅助意见，不代表法规符合、项目批准或正式专家结论。
- 任务最多每账号并发2个、全局4个；可停止，服务重启把未完成任务明确标记失败，原文保留。失败或停止不会伪装为成功结果。默认PPT五份额度不用于计算办公任务，模型服务费用另计。
- 团队仅创建者及受邀成员可访问；任务修改限定创建者、负责人或团队创建者。资料、文稿、模型和办公连接仍为个人私有。成员被禁用后失去API会话，自动邮箱同步也跳过该账号。

## 可复用项目与验证

直接依赖 [ExcelJS](https://github.com/exceljs/exceljs)、[PostalMime](https://github.com/postalsys/postal-mime)、[ImapFlow](https://github.com/postalsys/imapflow)、[Nodemailer](https://github.com/nodemailer/nodemailer)，使用各自随包许可证。看板参考 [Plane](https://github.com/makeplane/plane) 的需求池和任务状态流程，但未复制或嵌入其AGPL应用源码。语音服务是可选接口连接。

运行 `node --test test/office.test.mjs` 验证权限、提醒幂等、收集、秘密加密、证据评分、停止恢复和实际工作簿往返。`node scripts/verify-office.mjs` 在隔离账号/资料目录启动真实Hermes与本地模型测试服务，检查六类技能真实工具提交、HTTP与UI流程，不使用生产数据、真实邮箱或付费模型。
