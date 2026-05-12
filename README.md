# PUA Bot

Script-prompt Telegram chat bot.

The bot stores a small plain-text script library, injects it into every normal chat reply, and uses only two chat provider modes:

- `openai`: OpenAI-compatible APIs, including DeepSeek and similar providers.
- `claude`: Claude / Anthropic Messages API.

## Minimal Configuration

```env
TELEGRAM_AVAILABLE_TOKENS=123456:telegram-token
CHAT_WHITE_LIST=all
SCRIPT_ENABLE=true
SCRIPT_ADMIN_IDS=123456789
```

Use `CHAT_WHITE_LIST=all` to allow everyone. To restrict access, set comma-separated Telegram chat IDs instead.

OpenAI-compatible model:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
```

DeepSeek example:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.deepseek.com
OPENAI_CHAT_MODEL=deepseek-chat
```

Claude example:

```env
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-xxx
CLAUDE_API_BASE=https://api.anthropic.com/v1
CLAUDE_CHAT_MODEL=claude-3-5-haiku-latest
```

## Storage By Environment

Local/Docker:

```env
CONFIG_PATH=/app/config.json
TOML_PATH=/app/wrangler.toml
SCRIPT_FILE_PATH=/data/scripts.md
```

Vercel:

```env
KV_REST_API_URL=https://xxx.upstash.io
KV_REST_API_TOKEN=xxx
```

Cloudflare Workers:

```toml
kv_namespaces = [
  { binding = "DATABASE", id = "your-kv-namespace-id" }
]
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

All script commands require `SCRIPT_ADMIN_IDS`. Non-admin users receive `Permission denied`.

## Add Scripts

```text
/add
Price question
Pricing depends on your selected plan and usage.
Tell me your use case and I can recommend a suitable option.
```

Each `/add` appends one plain-text script record. Records are separated by a line containing only `---`.

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
