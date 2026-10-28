# 外部规范采用说明

核对日期：2026-10-27。下列项目用于研究方法，当前系统的执行引擎仍为Hermes，使用用户指定DeepSeek和本项目原生PPTX工具。以下内容为适配后的独立规则，不是安装或整段复制上游技能。

| 来源 | 核对的材料 | 本项目采用的位置 |
|---|---|---|
| [PPT Master](https://github.com/hugohe3/ppt-master/blob/main/skills/ppt-master/SKILL.md) | [执行约束](https://github.com/hugohe3/ppt-master/blob/main/skills/ppt-master/templates/spec_lock_reference.md)、[原生编辑](https://github.com/hugohe3/ppt-master/blob/main/skills/ppt-master/workflows/edit-native-pptx.md)、[模板分类](https://github.com/hugohe3/ppt-master/blob/main/skills/ppt-master/templates/README.md) | 区分任务路线、内容与模板权限；确定跨页约束，失败回到负责该问题的环节 |
| [Anthropic PPTX](https://github.com/anthropics/skills/blob/main/skills/pptx/SKILL.md) | 模板文字替换、文件关系校验、源文件对照与版式检查 | 素材使用及排版检查技能；保护原生对象、段落格式和资源关系 |
| [PPTAgent](https://github.com/icip-cas/PPTAgent/blob/main/skills/pptagent/SKILL.md) | 页级检查、成稿检查、修改后的检查失效、交付证据 | 排版检查与harness-review；渲染、检查、修复和重查分开记录 |
| [Presentation Agent Skills](https://github.com/hiamberhuang/presentation-agent-skills) | [汇报叙事](https://github.com/hiamberhuang/presentation-agent-skills/blob/main/skills/consulting-deck-expert/SKILL.md)、[QA](https://github.com/hiamberhuang/presentation-agent-skills/blob/main/skills/presentation-qa/SKILL.md)、[参考图重建](https://github.com/hiamberhuang/presentation-agent-skills/blob/main/skills/ppt-pixel-restore/SKILL.md) | 规划标题主线、观点与证据对应、保护元素、修改后对照检查 |

## 模块分工

- **presentation-style**：确定汇报对象、用途和用户限制，选择实际素材风格；不先造配色再找依据。
- **ppt-writing / planner**：按受众组织主题顺序，一页一个主旨，标题简短；事实、行动、目的及限定放进正文，不写进标题堆成两三个结论。
- **material-use / visual-selector**：先看真实构图，再匹配模块数、关系、字数与图片位。保留用户模板与素材原生结构，处理局部修改时保护其他页。
- **ppt-writing / writer**：根据真实槽位改写，明确标签、说明和数字角色；用显式样式处理粗细、居中、合理换行与字号层级。
- **chart-drawing**：先核对数据粒度、单位与来源，再决定图形；无真实数据时选择信息图或标注待补充。
- **layout-review**：区分结构校验、PowerPoint测量与真实视觉审核；修改后相关检查需要重做。
- **harness-review**：汇总每个检查项的证据和未执行项，不把生成了预览或模型自述当作视觉通过。

## 本项目的约束

1. 字号统一pt，坐标使用EMU。外部px数值不能直接作为pt；只有明确按96dpi解释的px才以0.75转换，实际尺寸以用户PPT画布为准。
2. 默认素材原色不变，中文遵循用户指定字体。外部预设色板、字体、SVG/HTML生成路线不覆盖现有模板与原生对象要求。
3. 沿用有限并发和局部修复，不复制上游固定检查轮数，也不增加无关确认步骤。
4. 使用外部方法不等于已经运行其工具或完成同题效果对比。本轮核对的是说明与规范，验证采用本项目测试和实际PPT渲染。

## 标题规则

中文内容标题建议8—18字，通常不超过24字（不含编号）；英文通常不超过60字符。用具体名词和动词表达一个主旨，保留必要的对象、时期或指标。不得把原文长句、多组并列结论或“主题、时间、模块、目标”字段全部拼进标题；不要为了凑短而只剩“赋能、提升、展望”等空泛词。标题中的成果性断言必须有依据，未验证的预期应写成工作方向或目标。

先由规划角色缩写；程序仅检查并返回问题，不按字符数截断事实。正文、图形和必要注释承担细节。封面主题与单位分层，目录使用素材风格的“目录”，结束页使用一处结束语。
