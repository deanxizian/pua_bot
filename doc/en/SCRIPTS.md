# Script-first Telegram bot

This MVP turns the bot into a script-first customer-service bot when `SCRIPT_ENABLE=true`.
When it is disabled or unset, normal multi-provider chat behavior is preserved.

## Configuration

Minimum:

```toml
SCRIPT_ENABLE = "true"
SCRIPT_ADMIN_IDS = "123456789,987654321"
```

Optional:

```toml
SCRIPT_ONLY_MODE = "false"
SCRIPT_MARKDOWN_KEY = "scripts:markdown"
SCRIPT_FALLBACK_ID = "fallback"
SCRIPT_DEFAULT_FALLBACK_TEXT = "I cannot answer this accurately yet. I can help you escalate to a human."
SCRIPT_CACHE_TTL_SECONDS = "30"
```

Use Telegram user IDs in `SCRIPT_ADMIN_IDS`, not usernames. You can get your ID from `/start`.

## Storage

Cloudflare Workers uses the existing `DATABASE` KV binding. The full Markdown document is stored under `SCRIPT_MARKDOWN_KEY`, which defaults to `scripts:markdown`. Usually you can manage it through `/add`, `/disable`, and `/export`. You can also seed it manually with Wrangler:

```bash
wrangler kv key put "scripts:markdown" --path ./scripts.md --binding DATABASE
```

Vercel reuses the existing Upstash Redis database abstraction already used by this project. Set the normal `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, then set `SCRIPT_ENABLE` and `SCRIPT_ADMIN_IDS`; no extra SDK is required.

Docker/local can use the existing local database, or a real Markdown file:

```json
{
  "database": { "type": "local", "path": "/data/cache" },
  "mode": "polling"
}
```

```bash
docker run -v ./data:/data \
  -e SCRIPT_ENABLE=true \
  -e SCRIPT_ADMIN_IDS=123456789 \
  -e SCRIPT_FILE_PATH=/data/scripts.md \
  pua-bot:latest
```

File writes use a temporary file plus rename.

## Markdown format

Each script is separated by `---`. The first JSON fenced block is metadata; text after it is the reply body.

````md
---

```json
{
  "id": "price",
  "title": "Price question",
  "triggers": ["price", "how much", "plan"],
  "mode": "rewrite",
  "priority": 90,
  "enabled": true
}
```

Pricing depends on your selected plan and usage.
Tell me your use case and I can recommend a suitable option.
````

Rules:

- `id` and `title` are required.
- `triggers` is a string array and may be empty.
- `mode` is `exact` or `rewrite`; default is `exact`.
- `priority` defaults to `0`.
- `enabled` defaults to `true`.
- Later blocks with the same `id` override earlier blocks.
- A final block with `enabled=false` disables that script.
- Fallback defaults to script ID `fallback`, or `SCRIPT_FALLBACK_ID`.

## Matching and reply modes

For normal user messages, command handling runs first. Non-command messages then match scripts by trigger substring, case-insensitive for English. Higher `priority` wins; ties prefer the later script version, then stable ID order.

`exact` replies with the script body as plain text and does not call the model.

`rewrite` calls the existing multi-provider/OpenAI-compatible model once, without chat history. The prompt contains only the matched script body, fallback body, and current user question.

If no script matches:

- If a fallback script exists, the bot replies with it.
- If `SCRIPT_ONLY_MODE=true` and no fallback exists, the bot replies with `SCRIPT_DEFAULT_FALLBACK_TEXT`.
- If `SCRIPT_ONLY_MODE=false`, the bot falls through to the original chat handler.

## Admin commands

All script commands require `SCRIPT_ADMIN_IDS`. Non-admin users receive `Permission denied`.

Add:

````text
/add
```json
{
  "id": "refund",
  "title": "Refund policy",
  "triggers": ["refund", "cancel order"],
  "mode": "exact",
  "priority": 80,
  "enabled": true
}
```

Refund eligibility depends on order status.
Please provide your order number so I can check it.
````

List:

```text
/list
/list all
```

Show:

```text
/show refund
```

Disable:

```text
/disable refund
```

Test:

```text
/test I want a refund
```

Export:

```text
/export
```

Reload storage into memory:

```text
/reload
```
