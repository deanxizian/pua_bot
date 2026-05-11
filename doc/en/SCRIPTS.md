# Script-first Telegram bot

This MVP turns the bot into a script-prompt customer-service bot when `SCRIPT_ENABLE=true`.
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

## Add Scripts

Each `/add` appends one independent script record. Send natural-language text directly; the whole input becomes that record's content, and the first line is used as the title.

```text
/add
Price question
Pricing depends on your selected plan and usage.
Tell me your use case and I can recommend a suitable option.
```

Storage rules:

- `/add` generates `id` automatically.
- `/add` derives `title` from the first non-empty line.
- New scripts default to `priority=0` and `enabled=true`.
- Legacy `triggers` and `mode` fields are tolerated when reading older data, but they are not used for normal replies and `/add` does not write them back.
- Later blocks with the same `id` override earlier blocks; `/disable <id>` appends a disabled version instead of editing old data.
- Fallback defaults to script ID `fallback`, or `SCRIPT_FALLBACK_ID`.

## Reply mode

For normal user messages, command handling runs first. Non-command text messages load all enabled scripts and pass the script set, fallback text, and current user question to the configured multi-provider/OpenAI-compatible model.

The bot no longer sends matched script bodies directly to users, and it no longer sends only one matched script to the model. The script library is the model's business source of truth.

Script replies do not use normal chat history, so old context cannot pollute scripted answers. The model prompt tells the model that every normal user message must be answered from the script set, not to invent prices, discounts, policies, promises, links, or contact details, and to guide the user from the script set when the user greets, asks vaguely, or gives an incomplete request.

If the script library fails to load:

- The message does not fall through to the normal `ChatHandler`.
- The request does not directly send the default fallback text, so normal user messages do not bypass the script prompt path.

## Admin commands

All script commands require `SCRIPT_ADMIN_IDS`. Non-admin users receive `Permission denied`.

Add:

```text
/add
Refund policy
Refund eligibility depends on order status.
Please provide your order number so I can check it.
```

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

Inspect the current script prompt status:

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
