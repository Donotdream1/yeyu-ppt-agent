# 用户模型连接与生成额度

## 使用

点击左下角头像 → 设置 → 模型 → 添加连接。选择 DeepSeek、OpenAI 或其他兼容 OpenAI 的服务，填写接口地址、模型名称、API Key。接口地址填写基础地址，例如 `https://api.deepseek.com` 或 `https://example.com/v1`。填写了完整 `/chat/completions` 地址时会自动归一化。

“测试连接”会发起一次很小的真实模型请求，检查响应和工具调用；服务商可能收取该次请求费用。保存并启用后，新的整稿生成、单页编辑、AI 素材推荐、风格解析均使用该连接。已开始的任务保留启动时的连接，切换在下一次任务生效。可保存多个连接、切换连接，或选择系统默认连接。

服务需要支持 OpenAI Chat Completions、流式响应和工具调用。涉及缩略图选版、参考页面分析时，还需支持图片输入。仅有 Anthropic Messages 等其他专用协议的服务，需要使用兼容网关。

API Key 只加密保存在服务端，不返回到浏览器。编辑时留空表示保留原 Key；删除连接会移除该连接的已存凭据。不同账号无法读取或切换对方的连接。

## 额度

普通用户默认累计成功生成 5 份新演示稿。规划、风格解析、已有作品的逐页修改和换版不重复计数；制作失败释放本次预留额度。并发任务先预留额度，不能绕过份数限制。删除作品不返还已使用额度。额度耗尽后提示联系管理员，配置自己的模型 Key 也不会自动取消额度限制。

用户可在“设置 → 账号”查看使用情况。管理员在“设置 → 用户管理 → 生成额度”调整每位普通用户的累计上限。管理员不受份数限制。首次迁移时，已登记作品按作品根编号去重计数；没有可追溯根编号的历史版本按独立作品计入。

## 运维与验证

- 凭据位于 `data/model-connections/connections.json`，使用 AES-256-GCM 加密；密钥为同目录 `encryption-key`。备份或迁移时须一并保留，且不应公开该目录。
- 额度账本位于 `data/auth/generation-quota.json`，与删除作品操作分离。重启会清理中断预留，已成功写入断点的成稿会补记。
- 单元测试：`node --test test/model-connections.test.mjs test/generation-quota.test.mjs`。
- 隔离 HTTP 与真实 Hermes 运行时测试：`node scripts/verify-model-quota-http.mjs --hermes`。此脚本使用临时账号目录和本地模拟模型服务，不消耗真实模型额度，也不修改生产用户。
- 浏览器测试：`npx playwright test test/ui/model-connections.spec.mjs`，默认目标为隔离测试服务 3211。
