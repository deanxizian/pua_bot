# PUA Bot

话术优先的 Telegram 客服机器人。

本项目保留 OpenAI-compatible / multi-provider 模型能力，但普通用户消息会把你维护的 Markdown 话术库作为模型提示词。它适合需要固定话术、明确边界、可控兜底回复的客服场景。

## 核心能力

- 支持 Cloudflare Workers、Vercel、Docker/local。
- 话术库是一份 Markdown 文档，不需要表结构、后台或向量检索。
- 普通用户消息会把全部启用话术作为模型提示词，让模型基于话术自然生成回复。
- 话术回答不使用普通聊天历史，避免历史上下文污染话术边界。
- 话术管理命令只允许 `SCRIPT_ADMIN_IDS` 里的 Telegram user_id 使用。
- 话术回复默认用纯文本发送，避免 Telegram Markdown 特殊字符导致发送失败。

## 最小配置

```toml
TELEGRAM_AVAILABLE_TOKENS = "123456:telegram-token"
CHAT_WHITE_LIST = "telegram-chat-id"

SCRIPT_ENABLE = "true"
SCRIPT_ADMIN_IDS = "123456789"
SCRIPT_ONLY_MODE = "false"
SCRIPT_MARKDOWN_KEY = "scripts:markdown"
SCRIPT_FALLBACK_ID = "fallback"
```

模型配置沿用原来的多提供商变量，例如 `OPENAI_API_KEY`、`OPENAI_CHAT_MODEL`、`OPENAI_API_BASE`、`GOOGLE_API_KEY`、`ANTHROPIC_API_KEY`、`CLOUDFLARE_ACCOUNT_ID` 等。

## 添加话术

```text
/add
价格咨询
我们的价格会根据你选择的套餐和使用量有所不同。
你可以先告诉我你的使用场景，我会帮你推荐合适的方案。
```

每次 `/add` 会追加一条独立话术数据。系统会自动生成 ID，并用首行作为标题。

更多命令、存储和部署说明见 [doc/cn/SCRIPTS.md](doc/cn/SCRIPTS.md) 和 [doc/en/SCRIPTS.md](doc/en/SCRIPTS.md)。

## 管理员命令

```text
/add
/list
/list all
/show <id>
/disable <id>
/test <text>
/export
/reload
```

非管理员调用会返回 `Permission denied`。

## 开发检查

```bash
pnpm install
pnpm run lint
pnpm run test
pnpm run build:core
pnpm run build:workers
pnpm run build:vercel
pnpm run build:local
```

## 部署

Cloudflare Workers:

```bash
pnpm run build:workers
pnpm run deploy:workers
```

Vercel:

```bash
pnpm run build:vercel
pnpm run deploy:vercel
```

Docker/local:

```bash
docker build -t pua-bot:latest .
docker compose up
```

Docker 文件存储可挂载 `/data` 并设置 `SCRIPT_FILE_PATH=/data/scripts.md`。
