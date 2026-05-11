# 话术优先 Telegram 机器人

当 `SCRIPT_ENABLE=true` 时，机器人会优先使用 Markdown 话术库回复普通用户消息。
当该配置未设置或不是 `true` 时，项目尽量保持原来的通用 ChatGPT Telegram bot 行为。

## 配置

最小配置：

```toml
SCRIPT_ENABLE = "true"
SCRIPT_ADMIN_IDS = "123456789,987654321"
```

可选配置：

```toml
SCRIPT_ONLY_MODE = "false"
SCRIPT_MARKDOWN_KEY = "scripts:markdown"
SCRIPT_FALLBACK_ID = "fallback"
SCRIPT_DEFAULT_FALLBACK_TEXT = "这个问题我暂时还不能准确回答，我可以帮你转人工进一步确认。"
SCRIPT_CACHE_TTL_SECONDS = "30"
```

`SCRIPT_ADMIN_IDS` 必须填写 Telegram user_id，多个 ID 用逗号分隔。不要使用 username。可以通过 `/start` 查看自己的 ID。

## 存储

Cloudflare Workers 复用项目已有的 `DATABASE` KV 绑定。完整 Markdown 话术库默认存储在 `scripts:markdown`，也可以用 `SCRIPT_MARKDOWN_KEY` 改名。通常用 `/add`、`/disable`、`/export` 管理即可，也可以用 Wrangler 预置：

```bash
wrangler kv key put "scripts:markdown" --path ./scripts.md --binding DATABASE
```

Vercel 复用项目已有的 Upstash Redis database abstraction。继续设置原项目需要的 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`，再增加 `SCRIPT_ENABLE` 与 `SCRIPT_ADMIN_IDS` 即可，不需要额外 SDK。

Docker/local 可以继续用现有本地数据库，也可以使用真实 Markdown 文件：

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
  chatgpt-telegram-workers:latest
```

文件写入使用 tmp + rename，避免写入半截内容。

## Markdown 格式

每条话术用 `---` 分隔。第一个 `json` fenced block 是元数据，后面的文本是话术正文。

````md
---

```json
{
  "id": "price",
  "title": "价格咨询",
  "triggers": ["价格", "多少钱", "怎么收费", "套餐"],
  "mode": "rewrite",
  "priority": 90,
  "enabled": true
}
```

我们的价格会根据你选择的套餐和使用量有所不同。
你可以先告诉我你的使用场景，我会帮你推荐合适的方案。
````

字段规则：

- `id` 和 `title` 必填。
- `triggers` 是字符串数组，可以为空。
- `mode` 可选 `exact` 或 `rewrite`，默认 `exact`。
- `priority` 默认 `0`。
- `enabled` 默认 `true`。
- 同一个 `id` 可以出现多次，后出现的版本生效。
- 最后一条同 `id` 记录如果 `enabled=false`，该话术视为禁用。
- 兜底话术默认 ID 是 `fallback`，也可以用 `SCRIPT_FALLBACK_ID` 指定。

## 匹配与回复模式

普通用户消息会先经过原有命令处理。不是命令的文本消息才进入话术匹配。匹配采用简单包含匹配，英文大小写不敏感；多个话术命中时，优先级高者优先，优先级相同则后出现的版本优先，再按 ID 稳定排序。

`exact`：直接用纯文本回复话术正文，不调用模型。

`rewrite`：复用项目已有 OpenAI-compatible / multi-provider 模型能力，但不进入普通聊天历史流程。模型输入只包含命中的话术正文、兜底话术正文和当前用户问题。

未命中时：

- 如果存在 fallback 话术，直接回复 fallback。
- 如果 `SCRIPT_ONLY_MODE=true` 且没有 fallback，回复 `SCRIPT_DEFAULT_FALLBACK_TEXT`。
- 如果 `SCRIPT_ONLY_MODE=false`，继续走原来的 `ChatHandler`。

## 管理员命令

所有话术命令都必须通过 `SCRIPT_ADMIN_IDS` 校验。非管理员调用会返回 `Permission denied`。

新增：

````text
/add
```json
{
  "id": "refund",
  "title": "退款说明",
  "triggers": ["退款", "退钱", "取消订单"],
  "mode": "exact",
  "priority": 80,
  "enabled": true
}
```

退款需要根据订单状态判断。
请你提供订单号，我帮你进一步确认。
````

列表：

```text
/list
/list all
```

查看：

```text
/show refund
```

禁用：

```text
/disable refund
```

测试匹配：

```text
/test 我想退款
```

导出完整 Markdown：

```text
/export
```

从存储重新加载：

```text
/reload
```
