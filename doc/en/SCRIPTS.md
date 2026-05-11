# Script-prompt Telegram bot

This MVP turns the bot into a script-prompt Telegram chat bot when `SCRIPT_ENABLE=true`.
When it is disabled or unset, normal multi-provider chat behavior is preserved.

## Configuration

Minimum:

```toml
SCRIPT_ENABLE = "true"
SCRIPT_ADMIN_IDS = "123456789,987654321"
```

Optional:

```toml
SCRIPT_MARKDOWN_KEY = "scripts:markdown"
SCRIPT_CACHE_TTL_SECONDS = "30"
```

Use Telegram user IDs in `SCRIPT_ADMIN_IDS`, not usernames. You can get your ID from `/start`.

## Storage

Cloudflare Workers uses the existing `DATABASE` KV binding. The full plain-text script document is stored under `SCRIPT_MARKDOWN_KEY`, which defaults to `scripts:markdown`. The variable name is kept for compatibility; the value now stores plain text. Usually you can manage it through `/add`, `/disable`, and `/export`. You can also seed it manually with Wrangler:

```bash
wrangler kv key put "scripts:markdown" --path ./scripts.txt --binding DATABASE
```

Vercel reuses the existing Upstash Redis database abstraction already used by this project. Set the normal `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, then set `SCRIPT_ENABLE` and `SCRIPT_ADMIN_IDS`; no extra SDK is required.

Docker/local can use the existing local database, or a real file:

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

Each `/add` appends one independent plain-text script record. Send natural-language text directly; the whole input becomes that record's content, and the first line is used as the list title.

```text
/add
Price question
Pricing depends on your selected plan and usage.
Tell me your use case and I can recommend a suitable option.
```

Storage rules:

- The stored document is plain text.
- Records are separated by a line containing only `---`.
- `/add` appends raw text and does not write JSON metadata.
- `/list` shows a generated index and the first non-empty line as the title.
- `/show <index>` displays only the script text.
- `/disable <index>` removes that record and rewrites the document as plain text.
- Legacy JSON records are still readable, and the next successful load migrates storage back to plain text.

## Reply mode

For normal user messages, command handling runs first. Non-command text messages load all scripts and pass the script set plus the current user question to the configured multi-provider/OpenAI-compatible model.

The bot does not select one script and does not send script bodies directly to users. The script library is prompt context for every normal reply.

Script replies use the existing chat history flow, but the system prompt is extended with the current script library for every normal message. The model prompt tells the model to read the script library before every reply, use its facts, wording, tone, and boundaries whenever useful, and not invent prices, discounts, policies, promises, links, or contact details outside the script set. If the script set does not cover casual chat or an incomplete question, the bot may chat normally or ask a clarifying question.

If the script library fails to load:

- The message does not bypass script prompt handling.
- The bot still calls the model with an empty script library prompt, so normal user messages do not bypass the script-prompt path.

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
/show 1
```

Disable:

```text
/disable 1
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
