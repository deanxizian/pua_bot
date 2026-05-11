# 话术优先 Telegram 机器人

当 `SCRIPT_ENABLE=true` 时，机器人会把 Markdown 话术库作为模型提示词来回复普通用户消息。
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
  pua-bot:latest
```

文件写入使用 tmp + rename，避免写入半截内容。

## 添加话术

每次 `/add` 会追加一条独立话术数据。直接输入自然语言即可，整段文本会成为这一条话术的正文，首行会作为标题。

```text
/add
价格咨询
我们的价格会根据你选择的套餐和使用量有所不同。
你可以先告诉我你的使用场景，我会帮你推荐合适的方案。
```

存储规则：

- `/add` 会自动生成 `id`。
- `/add` 用首个非空行生成 `title`。
- 新增话术默认 `priority=0`、`enabled=true`。
- 旧数据里的 `triggers`、`mode` 字段会被兼容读取，但不会参与普通回复，也不会由 `/add` 重新写出。
- 同一个 `id` 可以出现多次，后出现的版本生效；`/disable <id>` 会追加一条禁用版本，不会改写旧数据。
- 兜底话术默认 ID 是 `fallback`，也可以用 `SCRIPT_FALLBACK_ID` 指定。

## 回复模式

普通用户消息会先经过原有命令处理。不是命令的文本消息会加载全部启用话术，并把话术集、兜底话术和当前用户问题一起交给当前配置的 OpenAI-compatible / multi-provider 模型生成回复。

机器人不会再把命中的话术正文直接原样发送给用户，也不会只把单条命中话术交给模型。话术库是模型回答的业务依据。

话术回复不进入普通聊天历史流程，避免历史上下文污染话术边界。模型提示词要求它只能基于话术集回答，不能编造价格、优惠、政策、承诺、链接或联系方式；如果问题超出话术范围，只能回复兜底话术。

如果没有任何启用话术：

- `SCRIPT_ONLY_MODE=true` 时回复 `SCRIPT_DEFAULT_FALLBACK_TEXT`。
- `SCRIPT_ONLY_MODE=false` 时继续走原来的 `ChatHandler`。

## 管理员命令

所有话术命令都必须通过 `SCRIPT_ADMIN_IDS` 校验。非管理员调用会返回 `Permission denied`。

新增：

```text
/add
退款说明
退款需要根据订单状态判断。
请你提供订单号，我帮你进一步确认。
```

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

检查当前话术集提示词状态：

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
