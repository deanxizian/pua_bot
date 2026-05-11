# PUA Bot

Script-first Telegram customer-service bot.

This project keeps OpenAI-compatible and multi-provider model support, but normal user messages are answered with a small script library injected as model prompt material. It is intended for scenarios where curated wording, policy boundaries, and safe fallback replies matter more than open-ended chat.

## What It Does

- Runs on Cloudflare Workers, Vercel, or Docker/local.
- Stores scripts as one Markdown document, not a database schema.
- Injects all enabled scripts into the model prompt so replies are generated naturally from the script set.
- Script replies do not use normal chat history, so old context cannot leak into scripted answers.
- Restricts script management to Telegram user IDs from `SCRIPT_ADMIN_IDS`.
- Sends script replies as plain text to avoid Telegram Markdown escaping failures.

## Main Configuration

```toml
TELEGRAM_AVAILABLE_TOKENS = "123456:telegram-token"
CHAT_WHITE_LIST = "telegram-chat-id"

SCRIPT_ENABLE = "true"
SCRIPT_ADMIN_IDS = "123456789"
SCRIPT_ONLY_MODE = "false"
SCRIPT_MARKDOWN_KEY = "scripts:markdown"
SCRIPT_FALLBACK_ID = "fallback"
```

For model configuration, keep using the existing provider variables such as `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `OPENAI_API_BASE`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, and related options.

## Add Scripts

```text
/add
Price question
Pricing depends on your selected plan and usage.
Tell me your use case and I can recommend a suitable option.
```

Each `/add` appends one script record. The whole natural-language input becomes that record's content, and the first line is used as the title.

See [doc/en/SCRIPTS.md](doc/en/SCRIPTS.md) and [doc/cn/SCRIPTS.md](doc/cn/SCRIPTS.md) for commands, storage notes, and deployment examples.

## Admin Commands

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

Non-admin users receive `Permission denied`.

## Development

```bash
pnpm install
pnpm run lint
pnpm run test
pnpm run build:core
pnpm run build:workers
pnpm run build:vercel
pnpm run build:local
```

## Deploy

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

For Docker script file storage, mount `/data` and set `SCRIPT_FILE_PATH=/data/scripts.md`.
