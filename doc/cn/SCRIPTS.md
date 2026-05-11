# 基于话术集提示词的 Telegram 机器人

当 `SCRIPT_ENABLE=true` 时，机器人会把话术集作为模型提示词来回复普通用户消息。
当该配置未设置或不是 `true` 时，项目尽量保持原来的通用 ChatGPT Telegram bot 行为。

## 配置

最小配置：

```toml
SCRIPT_ENABLE = "true"
SCRIPT_ADMIN_IDS = "123456789,987654321"
```

可选配置：

```toml
SCRIPT_MARKDOWN_KEY = "scripts:markdown"
SCRIPT_CACHE_TTL_SECONDS = "30"
```

`SCRIPT_ADMIN_IDS` 必须填写 Telegram user_id，多个 ID 用逗号分隔。不要使用 username。可以通过 `/start` 查看自己的 ID。

## 存储

Cloudflare Workers 复用项目已有的 `DATABASE` KV 绑定。完整纯文本话术文档默认存储在 `scripts:markdown`，也可以用 `SCRIPT_MARKDOWN_KEY` 改名。变量名保留是为了兼容，实际内容现在是纯文本。通常用 `/add`、`/disable`、`/export` 管理即可，也可以用 Wrangler 预置：

```bash
wrangler kv key put "scripts:markdown" --path ./scripts.txt --binding DATABASE
```

Vercel 复用项目已有的 Upstash Redis database abstraction。继续设置原项目需要的 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`，再增加 `SCRIPT_ENABLE` 与 `SCRIPT_ADMIN_IDS` 即可，不需要额外 SDK。

Docker/local 可以继续用现有本地数据库，也可以使用真实文件：

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

每次 `/add` 会追加一条独立纯文本话术数据。直接输入自然语言即可，整段文本会成为这一条话术的正文，首行会作为列表标题。

```text
/add
价格咨询
我们的价格会根据你选择的套餐和使用量有所不同。
你可以先告诉我你的使用场景，我会帮你推荐合适的方案。
```

存储规则：

- 存储内容是纯文本。
- 多条话术用独占一行的 `---` 分隔。
- `/add` 只追加原始文本，不写 JSON 元数据。
- `/list` 显示系统生成的序号和首个非空行标题。
- `/show <序号>` 只显示话术文本。
- `/disable <序号>` 会移除对应记录，并把整份话术文档重写为纯文本。
- 旧 JSON 记录仍可读取，下一次成功加载会把存储迁移回纯文本。

## 回复模式

普通用户消息会先经过原有命令处理。不是命令的文本消息会加载全部话术，并把话术集和当前用户问题一起交给当前配置的 OpenAI-compatible / multi-provider 模型生成回复。

机器人不会选择单条话术，也不会把某条话术正文直接原样发送给用户。话术集是每次普通回复的提示词上下文。

话术回复继续使用原来的聊天历史流程，但每次普通消息都会把当前话术集追加到系统提示词里。模型提示词要求每次回复前都先阅读话术集，尽可能使用其中的事实、表达、语气和边界，不能编造话术集以外的价格、优惠、政策、承诺、链接或联系方式。对话术集没有覆盖的闲聊、寒暄或不完整问题，可以正常聊天或追问澄清。

如果话术集加载失败：

- 该条消息不会绕过话术集提示词处理。
- 机器人仍会带着空话术集提示词调用模型，避免普通用户消息绕开“话术集 prompt”路径。

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
/show 1
```

禁用：

```text
/disable 1
```

检查当前话术集提示词状态：

```text
/test 我想退款
```

导出完整话术文档：

```text
/export
```

从存储重新加载：

```text
/reload
```
