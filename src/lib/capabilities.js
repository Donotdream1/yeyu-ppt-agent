import {Presentation,PenLine,KanbanSquare,Inbox,Mic,FileSpreadsheet,ClipboardCheck} from 'lucide-react';
export const capabilities=[
 {id:'create',title:'PPT演示',icon:Presentation,description:'文档或主题，生成可编辑演示稿',input:'文档 / 主题 + PPT模板',output:'逐页方案、可编辑PPT、全页预览',steps:['组织逐页内容','选择原生素材','填充并检查','逐页修改与导出'],color:'blue'},
 {id:'office-writing',title:'办公撰写',icon:PenLine,description:'通知、邮件、工作汇总与收集说明',input:'要求 + 事实背景',output:'可编辑草稿、Word、确认后的邮件',steps:['明确对象与目的','生成草稿','补齐缺失事实','保存、导出或确认发送'],color:'amber'},
 {id:'office-tasks',title:'团队任务',icon:KanbanSquare,description:'需求收集、分工、进度与自动催办',input:'团队成员 + 需求或行动项',output:'任务看板、站内提醒、收集汇总表',steps:['创建团队并邀请','定义任务与负责人','跟踪进度和截止时间','汇总填报数据'],color:'green'},
 {id:'office-summary',title:'信息归档',icon:Inbox,description:'聚合邮件、通知、纪要并提取重点',input:'原文 / 文件 / IMAP邮件',output:'来源记录、摘要、关键词、行动项',steps:['采集资料','选择待汇总内容','核对摘要依据','归档与检索'],color:'indigo'},
 {id:'office-meeting',title:'会议语音',icon:Mic,description:'听写、录音转写、纪要与语音任务',input:'音频 / 浏览器听写 / 转写文本',output:'转写、会议纪要、任务候选',steps:['录音或导入','校正术语与数字','提取决定和行动','确认后加入看板'],color:'rose'},
 {id:'office-sheet',title:'智能表格',icon:FileSpreadsheet,description:'用自然语言整理数据、写公式与分析',input:'Excel/WPS的XLSX或CSV',output:'操作方案、结果预览、新XLSX',steps:['读取实际表头','规划白名单操作','检查后执行','下载并核对结果'],color:'teal'},
 {id:'office-review',title:'项目评审',icon:ClipboardCheck,description:'辅助审查可研和需求，定位证据与缺项',input:'可研 / 需求文档 + 评审重点',output:'六维评分、原文依据、改进建议、Word',steps:['读取文档','按维度审查','核实原文引用','查看评分并导出报告'],color:'violet'}
];
