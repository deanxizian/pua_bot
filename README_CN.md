# PUA Bot

基于话术库提示词的 Telegram 聊天机器人。

机器人会把一份小型纯文本话术库注入到每次普通聊天回复中。模型入口只保留两类：

- `openai`：OpenAI-compatible API，DeepSeek 等兼容接口也走这一类。
- `claude`：Claude / Anthropic Messages API。

## 最小配置

```env
TELEGRAM_AVAILABLE_TOKENS=123456:telegram-token
CHAT_WHITE_LIST=all
CHAT_GROUP_WHITE_LIST=
SCRIPT_ENABLE=true
SCRIPT_ADMIN_IDS=123456789
```

`CHAT_WHITE_LIST=all` 表示开放给所有人。只想允许指定用户时，填 Telegram chat_id，多个用逗号分隔。

OpenAI-compatible：

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
```

DeepSeek：

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

## 不同环境存储

Local/Docker：

```env
CONFIG_PATH=/app/config.json
TOML_PATH=/app/wrangler.toml
SCRIPT_FILE_PATH=/data/scripts.md
```

Vercel：

```env
KV_REST_API_URL=https://xxx.upstash.io
KV_REST_API_TOKEN=xxx
```

Cloudflare Workers：

```toml
kv_namespaces = [
  { binding = "DATABASE", id = "你的KV namespace id" }
]
```

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

所有话术命令都必须通过 `SCRIPT_ADMIN_IDS` 校验。非管理员会收到 `Permission denied`。

## 添加话术

```text
/add
价格咨询
我们的价格会根据你选择的套餐和使用量有所不同。
你可以先告诉我你的使用场景，我会帮你推荐合适的方案。
```

每次 `/add` 追加一条纯文本话术。多条话术用单独一行 `---` 分隔。

更多说明见 [doc/cn/SCRIPTS.md](doc/cn/SCRIPTS.md)。
