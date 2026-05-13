# PUA Bot

一个基于话术库的 Telegram 聊天机器人。普通用户消息会优先参考你维护的话术，再由模型生成自然、简洁的回复。

## 功能概览

- 话术以纯文本保存，不需要业务数据库表、不做向量检索。
- 话术分为“核心思想”和“常用语”两类。
- 保留 OpenAI-compatible 和 Claude 两种模型接入方式。
- `MAX_HISTORY_LENGTH > 0` 时会保留最近聊天历史。
- 支持 Vercel、Cloudflare Workers、Local/Docker 部署。
- 项目固定使用中文机器人文案和中文话术提示词，不再提供运行时语言切换。

## 最小配置

```env
TELEGRAM_AVAILABLE_TOKENS=123456:telegram-token
CHAT_WHITE_LIST=all
CHAT_GROUP_WHITE_LIST=
SCRIPT_ENABLE=true
SCRIPT_ADMIN_IDS=123456789
MAX_HISTORY_LENGTH=20
SHOW_REPLY_BUTTON=false
```

OpenAI-compatible：

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
```

Claude：

```env
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-xxx
CLAUDE_API_BASE=https://api.anthropic.com/v1
CLAUDE_CHAT_MODEL=claude-3-5-haiku-latest
```

访问控制：

- `CHAT_WHITE_LIST=all` 表示私聊开放给所有人。
- `CHAT_WHITE_LIST=123,456` 表示只允许这些私聊 chat id。
- `CHAT_GROUP_WHITE_LIST=` 表示不支持群组。
- `CHAT_GROUP_WHITE_LIST=-100123,-100456` 表示只允许这些群组。
- `SCRIPT_ADMIN_IDS` 必须填 Telegram user id，不要填 username。

## Vercel 部署

保持仓库默认配置即可：

```text
Install Command: pnpm install
Build Command: pnpm run build:vercel
```

必须配置：

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

首次部署后访问：

```text
https://你的域名/init
```

只有第一次部署、换域名、换 bot token、webhook 失效或命令菜单变化时，才需要重新访问 `/init`。

## Cloudflare Workers 部署

创建 KV namespace，并绑定为 `DATABASE`。然后把 `wrangler-example.toml` 复制为 `wrangler.toml`。

```toml
kv_namespaces = [
  { binding = "DATABASE", id = "你的 KV namespace id" }
]
```

模型密钥建议用 Wrangler Secret：

```bash
pnpm wrangler secret put OPENAI_API_KEY
pnpm wrangler secret put CLAUDE_API_KEY
```

构建并部署：

```bash
pnpm install
pnpm run build:workers
pnpm run deploy:workers
```

部署后访问：

```text
https://你的 Worker 域名/init
```

## Local / Docker

Docker 下建议把话术保存到 `/data/scripts.md`。

webhook 模式最小 `config.json`：

```json
{
  "database": {
    "type": "local",
    "path": "/data/cache.json"
  },
  "server": {
    "hostname": "0.0.0.0",
    "port": 8787,
    "baseURL": "https://你的公网域名"
  },
  "mode": "webhook"
}
```

本地快速轮询测试可以用：

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

启动：

```bash
docker compose up -d --build
```

## 机器人命令

普通用户命令：

```text
/start
/new
/help
```

话术管理员命令：

```text
/add <话术文本>
/list
/delete <序号>
```

话术管理员命令必须通过 `SCRIPT_ADMIN_IDS` 校验。非管理员直接调用会收到 `Permission denied`。

Telegram 命令菜单只注册普通命令。`/add`、`/list`、`/delete` 只会在管理员执行 `/help` 时显示。

## 添加话术

核心思想优先级最高：

```text
/add 0 回复必须简洁。不要承诺折扣。
```

常用语优先级较低：

```text
/add 价格会根据套餐不同而变化。你可以先告诉我使用场景。
```

一次 `/add` 可以输入多句或多行，每句或每行都会保存为一条话术。用 `/list` 查看序号，用 `/delete <序号>` 删除。

## 运行时行为

- 话术模式下模型调用失败时，用户只会看到安全兜底文案，真实错误会写入 `console.error`。
- 私聊使用 Telegram 草稿消息做流式预览，然后发送最终消息。
- 群组因为 Telegram 草稿只支持私聊，会使用可编辑占位消息做流式预览。
- Vercel KV / Redis 写话术时会使用短 TTL 的 `SET NX EX` 锁。
- Local/Docker 写话术时会使用同进程 mutex，并用临时文件加 rename 原子写入。
- Cloudflare KV 会使用版本检查和重试降低覆盖写风险，但它不是强一致 compare-and-swap 存储。如果后续存在多个管理员高并发写入，建议迁移到 Durable Object。

## 开发

```bash
pnpm install
pnpm run lint
pnpm run test
pnpm run build:core
pnpm run build:workers
pnpm run build:vercel
pnpm run build:local
```

更多说明见 [doc/SCRIPTS.md](doc/SCRIPTS.md)。
