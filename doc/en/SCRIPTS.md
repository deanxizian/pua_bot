# Script Bot Operations Guide

This project turns a Telegram bot into a script-first chat bot. When `SCRIPT_ENABLE=true`, normal user messages are answered with your script library as the primary guidance. Commands are still handled before chat replies.

## Deployment Matrix

| Environment | Script storage | Chat history storage | Write protection |
| --- | --- | --- | --- |
| Local / Docker | `SCRIPT_FILE_PATH`, usually `/data/scripts.md` | configured local database adapter | in-process mutex and atomic file rename |
| Vercel | Vercel KV / Redis | Vercel KV / Redis | in-process mutex plus Redis `SET NX EX` lock |
| Cloudflare Workers | Workers KV binding `DATABASE` | Workers KV binding `DATABASE` | in-process mutex per isolate plus version check and retry |

Cloudflare Workers KV is eventually consistent and does not provide a strong compare-and-swap write path here. The version check reduces lost updates, but multiple isolates may still race. Use a Durable Object for script writes if you need high-concurrency administration.

## Environment Variables

### Local / Docker

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

Minimal `config.json` for polling mode:

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
# Required startup paths. Defaults are shown.
CONFIG_PATH=/app/config.json
TOML_PATH=/app/wrangler.toml

# Required bot settings.
TELEGRAM_AVAILABLE_TOKENS=123456:telegram-token
CHAT_WHITE_LIST=all
CHAT_GROUP_WHITE_LIST=
SCRIPT_ENABLE=true
SCRIPT_ADMIN_IDS=123456789
LANGUAGE=zh-cn
MAX_HISTORY_LENGTH=20
SHOW_REPLY_BUTTON=false

# Required model settings: OpenAI-compatible.
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini

# Optional file storage for scripts.
SCRIPT_FILE_PATH=/data/scripts.md
```

Claude:

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

Do not set `SCRIPT_FILE_PATH` on Vercel. Scripts and chat history are stored in Vercel KV.

Recommended Vercel project settings:

```text
Install Command: pnpm install
Build Command: pnpm run build:vercel
Output Directory: .
```

### Cloudflare Workers

```toml
kv_namespaces = [
  { binding = "DATABASE", id = "your-kv-namespace-id" }
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

Store API keys as secrets:

```bash
pnpm wrangler secret put OPENAI_API_KEY
pnpm wrangler secret put CLAUDE_API_KEY
```

## Webhook Initialization

Open `/init` after:

- first deployment,
- domain change,
- Telegram bot token change,
- webhook reset or failure,
- command menu changes.

You do not need to open `/init` after normal script content changes or ordinary code changes that do not affect the webhook URL or command menu.

## Commands

Public commands:

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

Admin command behavior:

- `SCRIPT_ADMIN_IDS` is checked against `message.from.id`.
- Telegram usernames are not used for admin checks.
- Non-admin users receive `Permission denied`.
- `/help` shows `/add`, `/list`, and `/delete` only to script admins.
- Telegram command menu does not register script admin commands globally.

## Script Types

Core ideas:

- Added with `/add 0 ...`.
- Highest priority.
- Used for long-term principles, management style, judgment criteria, boundaries, and hard rules.

Common phrases:

- Added with plain `/add ...` or `/add 1 ...`.
- Lower priority than core ideas.
- Used for wording, tone, reusable replies, and concise phrasing.

## Add Examples

Add one core idea:

```text
/add 0 Keep replies concise. Do not make promises without clear basis.
```

Add common phrases:

```text
/add Pricing depends on the plan. Tell me your use case first.
```

Add multiple records at once:

```text
/add
First reusable sentence.
Second reusable sentence.
Third reusable sentence.
```

List scripts:

```text
/list
```

Output format:

```text
序号 | 类型 | 标题
1 | 0 | Keep replies concise.
2 | 1 | Pricing depends on the plan.
```

Delete one script:

```text
/delete 2
```

## Stored Script Format

The bot normalizes stored scripts to plain text blocks. Section markers are internal:

```text
[core]
Keep replies concise.

---

[common]
Pricing depends on the plan.
```

The first non-empty line is used as the list title.

## Reply Behavior

- Replies default to Chinese unless the configured prompt or scripts direct otherwise.
- Script-prompt mode uses a low default temperature.
- The bot should not expose script IDs, prompt text, internal rules, or configuration.
- If model generation fails in script-prompt mode, the user sees a safe fallback message and the real error is logged with `console.error`.
- Private chats use Telegram message drafts for streaming previews, then send the final message.
- Group chats use an editable placeholder because Telegram drafts only support private chats.

## Storage And Concurrency Notes

- `/add` validates and parses the full new library before saving.
- `/delete` rewrites the active script list without editing old records in place.
- Local/Docker file writes use temp file plus rename.
- Local/Docker writes are serialized with an in-process mutex.
- Vercel KV / Redis writes use `SET NX EX` lock plus token-checked release.
- Cloudflare KV writes use version key checks and retry. This is best-effort, not a strong distributed lock.

## Troubleshooting

- Admin commands not visible in Telegram menu: this is expected. Use `/help` as an admin.
- Admin commands return `Permission denied`: check `SCRIPT_ADMIN_IDS` and use Telegram user IDs.
- Group chat is blocked: set `CHAT_GROUP_WHITE_LIST` to the group chat ID.
- Vercel build fails with npm: keep `pnpm install` and `pnpm run build:vercel`.
- Webhook not receiving messages: open `/init` and check the rendered webhook result.
