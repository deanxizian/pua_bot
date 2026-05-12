# PUA Bot

Telegram bot that answers through a small, admin-managed script library. It keeps the original OpenAI-compatible / Claude model support, but normal user messages are guided by your scripts first.

## What It Does

- Stores scripts as plain text, without a database schema or vector search.
- Splits scripts into high-priority core ideas and lower-priority common phrases.
- Uses the model to rewrite or combine scripts naturally for Telegram replies.
- Keeps chat history in the configured database when `MAX_HISTORY_LENGTH > 0`.
- Supports Vercel, Cloudflare Workers, and local/Docker deployment.

## Quick Start

Minimal bot settings:

```env
TELEGRAM_AVAILABLE_TOKENS=123456:telegram-token
CHAT_WHITE_LIST=all
CHAT_GROUP_WHITE_LIST=
SCRIPT_ENABLE=true
SCRIPT_ADMIN_IDS=123456789
LANGUAGE=zh-cn
MAX_HISTORY_LENGTH=20
SHOW_REPLY_BUTTON=false
```

OpenAI-compatible model:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
```

Claude model:

```env
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-xxx
CLAUDE_API_BASE=https://api.anthropic.com/v1
CLAUDE_CHAT_MODEL=claude-3-5-haiku-latest
```

Access rules:

- `CHAT_WHITE_LIST=all` allows all private chats.
- `CHAT_WHITE_LIST=123,456` allows only those private chat IDs.
- `CHAT_GROUP_WHITE_LIST=` disables group chats.
- `CHAT_GROUP_WHITE_LIST=-100123,-100456` enables only those groups.
- `SCRIPT_ADMIN_IDS` must be Telegram user IDs, not usernames.

## Vercel

Keep the repository defaults:

```text
Install Command: pnpm install
Build Command: pnpm run build:vercel
```

Required environment variables:

```env
TELEGRAM_AVAILABLE_TOKENS=123456:telegram-token
CHAT_WHITE_LIST=all
CHAT_GROUP_WHITE_LIST=
SCRIPT_ENABLE=true
SCRIPT_ADMIN_IDS=123456789
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
KV_REST_API_URL=https://xxx.upstash.io
KV_REST_API_TOKEN=xxx
```

After first deployment, open:

```text
https://your-domain.vercel.app/init
```

Open `/init` again only when the domain, bot token, webhook, or command menu changes.

## Cloudflare Workers

Create a KV namespace and bind it as `DATABASE`, then copy `wrangler-example.toml` to `wrangler.toml`.

```toml
kv_namespaces = [
  { binding = "DATABASE", id = "your-kv-namespace-id" }
]
```

Use secrets for model keys:

```bash
pnpm wrangler secret put OPENAI_API_KEY
pnpm wrangler secret put CLAUDE_API_KEY
```

Build and deploy:

```bash
pnpm install
pnpm run build:workers
pnpm run deploy:workers
```

Then open:

```text
https://your-worker-domain/init
```

## Local / Docker

Docker stores scripts in `/data/scripts.md` when `SCRIPT_FILE_PATH=/data/scripts.md` is set.

Minimal `config.json` for webhook mode:

```json
{
  "database": {
    "type": "local",
    "path": "/data/cache.json"
  },
  "server": {
    "hostname": "0.0.0.0",
    "port": 8787,
    "baseURL": "https://your-public-domain"
  },
  "mode": "webhook"
}
```

For quick local polling tests, use:

```json
{
  "database": {
    "type": "local",
    "path": "/data/cache.json"
  },
  "mode": "polling"
}
```

```yaml
services:
  pua-bot:
    build: .
    ports:
      - "8787:8787"
    volumes:
      - ./config.json:/app/config.json:ro
      - ./wrangler.toml:/app/wrangler.toml:ro
      - ./data:/data
    environment:
      SCRIPT_FILE_PATH: /data/scripts.md
```

Start:

```bash
docker compose up -d --build
```

## Bot Commands

User commands:

```text
/start
/new
/help
```

Script admin commands:

```text
/add <script text>
/list
/delete <index>
```

Admin commands require `SCRIPT_ADMIN_IDS`. Non-admin users receive `Permission denied`.

Telegram command menu is intentionally limited to public commands. Admin script commands are shown in `/help` only for script admins.

## Add Scripts

Core ideas have higher priority:

```text
/add 0 Keep replies concise. Do not promise discounts.
```

Common phrases have lower priority:

```text
/add Pricing depends on the selected plan. Tell me your use case first.
```

One `/add` can contain multiple sentences or multiple lines. Each sentence or line is stored as one script record. Use `/list` to view script indexes and `/delete <index>` to remove one.

## Runtime Behavior

- Script-prompt failures return a safe fallback text to users and log real errors with `console.error`.
- Private chats use Telegram message drafts for streaming previews, then send the final message.
- Group chats use an editable placeholder because Telegram drafts only support private chats.
- Vercel KV / Redis script writes use a short `SET NX EX` lock.
- Local/Docker script writes use an in-process mutex plus atomic file writes.
- Cloudflare KV uses version checks and retries, but it is not a strong compare-and-swap store. Use a Durable Object later if script admins may write concurrently from multiple isolates.

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

More details: [doc/en/SCRIPTS.md](doc/en/SCRIPTS.md).
