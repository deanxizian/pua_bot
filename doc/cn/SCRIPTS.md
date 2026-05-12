# 话术配置

当 `SCRIPT_ENABLE=true` 时，普通用户消息会走话术提示词流程。命令仍然优先处理。

## Local / Docker

```env
# 必须：启动路径，下面是默认值
CONFIG_PATH=/app/config.json
TOML_PATH=/app/wrangler.toml

# 必须：机器人配置
TELEGRAM_AVAILABLE_TOKENS=123456:telegram-token
CHAT_WHITE_LIST=all
SCRIPT_ENABLE=true
SCRIPT_ADMIN_IDS=123456789

# 必须：模型配置，OpenAI-compatible
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini

# 可选：话术文件存储
SCRIPT_FILE_PATH=/data/scripts.md
SCRIPT_MARKDOWN_KEY=scripts:markdown
SCRIPT_CACHE_TTL_SECONDS=30

# 可选：聊天历史
AUTO_TRIM_HISTORY=true
MAX_HISTORY_LENGTH=20
```

DeepSeek 走同一套 OpenAI-compatible 配置：

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.deepseek.com
OPENAI_CHAT_MODEL=deepseek-chat
```

Claude：

```env
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-xxx
CLAUDE_API_BASE=https://api.anthropic.com/v1
CLAUDE_CHAT_MODEL=claude-3-5-haiku-latest
```

## Vercel

```env
# 必须：机器人配置
TELEGRAM_AVAILABLE_TOKENS=123456:telegram-token
CHAT_WHITE_LIST=all
SCRIPT_ENABLE=true
SCRIPT_ADMIN_IDS=123456789

# 必须：Vercel KV / Redis 绑定后自动生成
KV_REST_API_URL=https://xxx.upstash.io
KV_REST_API_TOKEN=xxx

# 必须：模型配置
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini

# 可选
SCRIPT_MARKDOWN_KEY=scripts:markdown
SCRIPT_CACHE_TTL_SECONDS=30
AUTO_TRIM_HISTORY=true
MAX_HISTORY_LENGTH=20
```

Vercel 不建议使用 `SCRIPT_FILE_PATH`。话术和聊天历史都会存到 Vercel KV。

## Cloudflare Workers

```toml
kv_namespaces = [
  { binding = "DATABASE", id = "你的KV namespace id" }
]

[vars]
TELEGRAM_AVAILABLE_TOKENS = "123456:telegram-token"
CHAT_WHITE_LIST = "all"
SCRIPT_ENABLE = "true"
SCRIPT_ADMIN_IDS = "123456789"

AI_PROVIDER = "openai"
OPENAI_API_BASE = "https://api.openai.com/v1"
OPENAI_CHAT_MODEL = "gpt-4o-mini"

SCRIPT_MARKDOWN_KEY = "scripts:markdown"
SCRIPT_CACHE_TTL_SECONDS = "30"
AUTO_TRIM_HISTORY = "true"
MAX_HISTORY_LENGTH = "20"
```

密钥建议用 Wrangler Secret：

```bash
pnpm wrangler secret put OPENAI_API_KEY
pnpm wrangler secret put CLAUDE_API_KEY
```

## 话术格式

每条话术是纯文本。第一行非空内容会作为 `/list` 里的标题。

```text
价格咨询
我们的价格会根据你选择的套餐和使用量有所不同。
你可以先告诉我你的使用场景，我会帮你推荐合适的方案。
```

多条话术用单独一行 `---` 分隔。

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

所有话术管理员命令都必须通过 `SCRIPT_ADMIN_IDS` 校验。非管理员会收到 `Permission denied`。
