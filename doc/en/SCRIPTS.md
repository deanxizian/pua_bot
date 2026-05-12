# Script Configuration

When `SCRIPT_ENABLE=true`, normal user messages are answered through the script-prompt flow. Command handling still runs first.

## Local / Docker

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

# Optional script file storage.
SCRIPT_FILE_PATH=/data/scripts.md
```

Claude:

```env
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-xxx
CLAUDE_API_BASE=https://api.anthropic.com/v1
CLAUDE_CHAT_MODEL=claude-3-5-haiku-latest
```

## Vercel

```env
# Required bot settings.
TELEGRAM_AVAILABLE_TOKENS=123456:telegram-token
CHAT_WHITE_LIST=all
CHAT_GROUP_WHITE_LIST=
SCRIPT_ENABLE=true
SCRIPT_ADMIN_IDS=123456789
LANGUAGE=zh-cn
MAX_HISTORY_LENGTH=20
SHOW_REPLY_BUTTON=false

# Required Vercel KV settings. These are created by Vercel KV / Redis integration.
KV_REST_API_URL=https://xxx.upstash.io
KV_REST_API_TOKEN=xxx

# Required model settings.
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
```

`SCRIPT_FILE_PATH` is not recommended on Vercel. Scripts and chat history are stored in Vercel KV.

## Cloudflare Workers

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

Store secret keys with Wrangler:

```bash
pnpm wrangler secret put OPENAI_API_KEY
pnpm wrangler secret put CLAUDE_API_KEY
```

## Reply Experience

Typing status is refreshed while the model is generating. Private chats use Telegram message drafts for streaming previews, then send the final message. Group chats fall back to editing a placeholder message because Telegram message drafts only support private chats.

## Script Format

Scripts are split into two priority groups:

- Core ideas: added with `/add 0 ...`; highest prompt priority.
- Common phrases: added with `/add ...`; lower prompt priority, used for wording and reusable replies.

One `/add` can contain multiple sentences or lines. Each sentence/line is stored as one record.

```text
/add 0 Always stay concise. Never promise a discount.
/add Pricing depends on your selected plan. Tell me your use case.
```

Stored records are still plain text and may be separated by a line containing only `---`.

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

All script admin commands require `SCRIPT_ADMIN_IDS`; other users receive `Permission denied`.
