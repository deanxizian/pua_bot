# PUA Bot

基于话术库提示词的 Telegram 聊天机器人。

机器人会把小型纯文本话术库注入到每次普通聊天回复中。模型入口只保留两类：

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

`CHAT_WHITE_LIST=all` 表示私聊开放给所有人。`CHAT_GROUP_WHITE_LIST` 为空表示不支持群组；需要支持多个群组时，用逗号分隔群组 chat_id。

OpenAI-compatible：

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
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
  { binding = "DATABASE", id = "你的 KV namespace id" }
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
/add 0 回复必须简洁。不要承诺折扣。
/add 价格会根据套餐不同而变化。你可以先告诉我使用场景。
```

`/add 0 ...` 添加核心思想，提示词优先级最高。普通 `/add ...` 添加常用语，优先级较低。一次 `/add` 可以输入多句或多行，每句/每行会存为一条。

更多说明见 [doc/cn/SCRIPTS.md](doc/cn/SCRIPTS.md)。
