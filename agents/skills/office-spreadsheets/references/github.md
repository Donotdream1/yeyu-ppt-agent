# GitHub技能适配：MiniMax XLSX

来源：MiniMax-AI/skills，提交60aaae52bb2af8162732751a4332f62a5fef518b，skills/minimax-xlsx/SKILL.md，MIT，MiniMax。原文及许可证见agents/vendor/office-skills/sheet。

采用的方法：首先检查工作表、表头和类型；区分分析、创建、编辑；保护原始文件；派生列使用可编辑公式；汇总直接使用实际数据，不根据样例推算总数。

本地变更：本次是提取表格数据、输出新的结果工作簿，不执行上游XML回写工具，不声称保留宏、透视表、原始样式或全部工作表。只允许工具白名单，禁止任意代码；公式由Excel/WPS重算。财务色彩和小数位规范仅在用户要求时采用。
