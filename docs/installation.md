# 安装与首次运行

## 环境

- Windows 10/11；当前完整制作与测量流程以桌面版 Microsoft PowerPoint 为验收环境。
- Node.js 22.12 或更新版本、npm、Git。
- [uv](https://docs.astral.sh/uv/getting-started/installation/)；安装脚本默认使用 Python 3.14。
- 支持 Chat Completions、流式响应及工具调用的模型接口。缩略图选版与图像解析还需要视觉输入能力。
- 自己有权使用的 PPTX 模板和素材。仓库不分发个人素材库、公司 Logo 或商业模板。

WPS 是方法参考来源之一，当前预览与测量脚本实际调用 `PowerPoint.Application`；不宣称 WPS、macOS 或 Linux 已获得同等验证。

## 安装

```powershell
git clone https://github.com/Donotdream1/yeyu-ppt-agent.git
cd yeyu-ppt-agent
npm ci
Copy-Item .env.example .env
npm run setup:hermes
npm run build
npm run doctor
npm start
```

`setup:hermes` 下载固定版本的 Hermes 到 `data/hermes-agent/`，创建隔离 Python 环境到 `data/hermes-runtime/`。源码、运行时及个人数据均不提交到仓库。下载需要网络，模型 Key 不参与安装。

已有 Hermes 源码时可以复用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-hermes.ps1 -HermesSource "C:/tools/hermes-agent"
```

然后在 `.env` 设置 `HERMES_SOURCE_PATH=C:/tools/hermes-agent`。不要把其他机器的绝对路径直接复制过来。安装脚本不会覆盖已有源码目录。

## 首次使用

1. 打开 `http://127.0.0.1:3210`。第一个注册账号是管理员，注册需填写随机图片验证码。
2. 设置 → 模型，添加自己的接口地址、模型名称与 API Key，测试并启用。也可由管理员配置 `.env` 共享回退连接。
3. 管理员导入输出模板及 PPTX 素材。在素材库确认逐页预览、标签、文字和图形的编辑能力。
4. 新建项目并选择保存位置，上传 DOCX、文本 PDF、TXT、Markdown，或粘贴内容；可补充图表数据和设计要求。
5. 生成逐页方案，检查真实章节、标题、要点和版式，然后制作。失败页保留断点，可人工换版后继续。
6. 在每页右侧对话修改文案、布局与图形，上传照片并指定位置。下载原生可编辑 PPTX 和实际生成的交付包。

目录与右上角章节导航按文档组织，模板原有四项不限制新的章节数量。不会为凑满版式编造事实。已有方案的章数需重新规划，刷新页面不自动重写。

## 局域网

默认监听 `0.0.0.0:3210`，同一局域网设备可访问 `http://你的本机IP:3210`；防火墙需允许该端口。仅本机使用时设置 `BIND_ADDRESS=127.0.0.1`。更换访问主机名/IP 后需要重新登录，登录 Cookie 不在不同主机之间共享。

首次注册前不要把空白安装直接暴露到公网。此版本面向可信本机或局域网，外网部署请阅读 [SECURITY.md](../SECURITY.md)。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| Hermes 不可用 | 运行 `npm run doctor`，检查源码和 Python 路径，再执行安装脚本。 |
| 模型能聊天但任务失败 | 测试连接需同时支持流式与工具调用；视觉功能还需要图片能力。确认模型名称、余额及速率限制。 |
| Office 无法生成预览 | 检查桌面 PowerPoint 安装；关闭应用自己打开的挂起文档后重试，不要批量杀死用户 Office 进程。 |
| 素材内容空白或字体溢出 | 查看具体页面/槽位诊断，精简对应文案或从推荐中换更合适的素材，勿用无限缩字号掩盖问题。 |
| 额度已用完 | 普通用户默认累计5份新成稿，管理员可在用户管理调整；失败释放预留，逐页修改不重复扣除。 |

## 升级与备份

更新前备份 `data/`、`.env` 和项目输出目录，再拉取新版本、执行 `npm ci` 和 `npm run build`。模型凭据备份须同时保存密文和对应加密密钥。不要清理或公开 `data/auth/`、`data/model-connections/`。不要在有生成/Office任务运行时强制重启。
