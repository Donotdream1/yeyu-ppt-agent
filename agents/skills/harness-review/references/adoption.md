# Harness Anything 的项目内适配

来源：https://github.com/yb2460/harness-anything

固定提交：e1924f8499ad6aaa11c579d5492205cfaa89c5d6。

读取的原始文件：cli_anything/wps/skills/SKILL.md、cli_anything/wps/styles/quality_checks.py。原 skill 作为 vendor/harness-anything-office/SKILL.md 保存，质量检查源码与许可证一起保留，避免把本项目实现冒充上游原生功能。

采用：数据结构驱动页面、按元素类型选择原生Office操作、以真实应用渲染确认结果，以及 visual / pedagogy / proofreading / parity / substance 五维审查。

冲突与处理：

| 上游默认 | 本次用户要求与实现 |
| --- | --- |
| 四字标题、36pt以上标题和24pt正文 | 用户参考规范优先，主标题32pt、正文14pt；保留完整观点，不强制四字标题 |
| 模板背景图片、matplotlib图片图表 | 原生母版/对象、原生图表/表格、必要时SVG及数据，不把截图当可编辑内容 |
| 默认预设色板 | 素材库真实颜色或明确用户配色；记录来源，不自行混色 |
| 固定目录、内容、致谢页序 | 根据用户文档与指定页数规划，不为凑页增加目录或致谢 |
| 清理全部WPS进程 | 不采用。使用本应用自己的只读临时文档与串行Office队列 |
| PPTX/PDF默认双格式 | 仅审查实际交付的格式；未生成PDF不得声称格式一致性通过 |

五维说明是框架，不自动证明教学质量、事实蕴含或审稿通过。上游 validate_slide 的字号建议用于保留原始诊断；科研规范的参数另行验证，两者结果不混同。
