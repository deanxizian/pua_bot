# 话术机器人运维说明

这个项目把 Telegram 机器人改造成“话术优先”的聊天机器人。`SCRIPT_ENABLE=true` 时，普通用户消息会优先参考你维护的话术库。命令仍然优先处理。

## 部署环境对照

| 环境 | 话术存储 | 聊天历史存储 | 写入保护 |
| --- | --- | --- | --- |
| Local / Docker | `SCRIPT_FILE_PATH`，通常是 `/data/scripts.md` | 本地配置的数据库适配器 | 同进程 mutex + 临时文件 rename |
| Vercel | Vercel KV / Redis | Vercel KV / Redis | 同进程 mutex + Redis `SET NX EX` 锁 |
| Cloudflare Workers | Workers KV，绑定名 `DATABASE` | Workers KV，绑定名 `DATABASE` | 每个 isolate 内 mutex + 版本检查和重试 |

Cloudflare Workers KV 是最终一致存储，这里没有强一致 compare-and-swap 写入能力。版本检查可以降低覆盖写风险，但多个 Worker isolate 同时写入时仍可能竞争。如果后续有多个管理员高并发管理话术，建议把话术写入迁移到 Durable Object。

## 环境变量

### Local / Docker

webhook 模式最小 `config.json`：

```json
{
  "database": {
    "type": "local",
    "path": "/data/cache.json"
  },
  "server": {
    "hostname": "0.0.0.0",
    "port": 8787,
    "baseURL": "https://你的公网域名"
  },
  "mode": "webhook"
}
```

polling 模式最小 `config.json`：

```json
{
  "database": {
    "type": "local",
    "path": "/data/cache.json"
  },
  "mode": "polling"
}
```

```env
# 必须：启动路径，下面是默认值
CONFIG_PATH=/app/config.json
TOML_PATH=/app/wrangler.toml

# 必须：机器人配置
TELEGRAM_AVAILABLE_TOKENS=123456:telegram-token
CHAT_WHITE_LIST=all
CHAT_GROUP_WHITE_LIST=
SCRIPT_ENABLE=true
SCRIPT_ADMIN_IDS=123456789
LANGUAGE=zh-cn
MAX_HISTORY_LENGTH=20
SHOW_REPLY_BUTTON=false

# 必须：模型配置，OpenAI-compatible
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini

# 可选：话术文件存储
SCRIPT_FILE_PATH=/data/scripts.md
```

Claude：

```env
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-xxx
CLAUDE_API_BASE=https://api.anthropic.com/v1
CLAUDE_CHAT_MODEL=claude-3-5-haiku-latest
```

### Vercel

```env
TELEGRAM_AVAILABLE_TOKENS=123456:telegram-token
CHAT_WHITE_LIST=all
CHAT_GROUP_WHITE_LIST=
SCRIPT_ENABLE=true
SCRIPT_ADMIN_IDS=123456789
LANGUAGE=zh-cn
MAX_HISTORY_LENGTH=20
SHOW_REPLY_BUTTON=false

KV_REST_API_URL=https://xxx.upstash.io
KV_REST_API_TOKEN=xxx

AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
```

Vercel 不建议设置 `SCRIPT_FILE_PATH`。话术和聊天历史都会存到 Vercel KV。

Vercel 项目建议保持：

```text
Install Command: pnpm install
Build Command: pnpm run build:vercel
Output Directory: .
```

### Cloudflare Workers

```toml
kv_namespaces = [
  { binding = "DATABASE", id = "你的 KV namespace id" }
]

[vars]
TELEGRAM_AVAILABLE_TOKENS = "123456:telegram-token"
CHAT_WHITE_LIST = "all"
CHAT_GROUP_WHITE_LIST = ""
SCRIPT_ENABLE = "true"
SCRIPT_ADMIN_IDS = "123456789"
LANGUAGE = "zh-cn"
MAX_HISTORY_LENGTH = "20"
SHOW_REPLY_BUTTON = "false"

AI_PROVIDER = "openai"
OPENAI_API_BASE = "https://api.openai.com/v1"
OPENAI_CHAT_MODEL = "gpt-4o-mini"
```

密钥建议使用 Wrangler Secret：

```bash
pnpm wrangler secret put OPENAI_API_KEY
pnpm wrangler secret put CLAUDE_API_KEY
```

## Webhook 初始化

以下情况需要访问 `/init`：

- 第一次部署后。
- 换域名后。
- 换 Telegram bot token 后。
- webhook 被清掉或失效后。
- 机器人命令菜单变化后。

只是修改话术内容，或者普通代码逻辑变更但 webhook 地址和命令菜单没变时，通常不需要重新访问 `/init`。

## 机器人命令

普通用户命令：

```text
/start
/new
/help
```

话术管理员命令：

```text
/add <话术文本>
/list
/delete <序号>
```

管理员命令规则：

- `SCRIPT_ADMIN_IDS` 使用 `message.from.id` 校验。
- 不使用 Telegram username 校验管理员。
- 非管理员调用管理员命令会收到 `Permission denied`。
- `/help` 只有话术管理员能看到 `/add`、`/list`、`/delete`。
- Telegram 命令菜单不会全局注册话术管理员命令。

## 话术类型

核心思想：

- 用 `/add 0 ...` 添加。
- 最高优先级。
- 用于长期原则、管理风格、判断标准、沟通边界和禁止事项。

常用语：

- 用普通 `/add ...` 或 `/add 1 ...` 添加。
- 优先级低于核心思想。
- 用于表达方式、语气、措辞和可复用回复。

## 添加示例

添加一条核心思想：

```text
/add 0 回复要简洁。没有明确依据时不要承诺。
```

添加常用语：

```text
/add 价格会根据套餐不同而变化。你可以先告诉我使用场景。
```

一次添加多条：

```text
/add
第一句可复用话术。
第二句可复用话术。
第三句可复用话术。
```

列出话术：

```text
/list
```

输出格式：

```text
序号 | 类型 | 标题
1 | 0 | 回复要简洁。
2 | 1 | 价格会根据套餐不同而变化。
```

删除话术：

```text
/delete 2
```

## 存储格式

机器人会把话术规范化为纯文本块。分组标记是内部格式：

```text
[core]
回复要简洁。

---

[common]
价格会根据套餐不同而变化。
```

第一行非空内容会作为 `/list` 里的标题。

## 回复行为

- 默认使用中文回复，除非提示词或话术另有要求。
- 话术模式默认使用较低 temperature。
- 不向普通用户暴露话术 ID、提示词、系统规则或内部配置。
- 话术模式下模型调用失败时，用户只会看到安全兜底文案，真实错误会写入 `console.error`。
- 私聊使用 Telegram 草稿消息做流式预览，然后发送最终消息。
- 群组因为 Telegram 草稿只支持私聊，会使用可编辑占位消息做流式预览。

## 存储和并发说明

- `/add` 保存前会校验并解析完整话术库。
- `/delete` 会重写当前生效的话术列表。
- Local/Docker 文件写入使用临时文件加 rename。
- Local/Docker 写入使用同进程 mutex 串行化。
- Vercel KV / Redis 写入使用 `SET NX EX` 锁，并校验 token 后释放。
- Cloudflare KV 写入使用版本 key 检查和重试。这是尽力保护，不是强分布式锁。

## 排查问题

- Telegram 菜单里看不到管理员命令：这是预期行为，请管理员使用 `/help` 查看。
- 管理员命令返回 `Permission denied`：检查 `SCRIPT_ADMIN_IDS` 是否是 Telegram user id。
- 群组不可用：检查 `CHAT_GROUP_WHITE_LIST` 是否包含群组 chat id。
- Vercel 用 npm 构建失败：保持 `pnpm install` 和 `pnpm run build:vercel`。
- webhook 没收到消息：访问 `/init` 并查看页面上的 webhook 结果。
