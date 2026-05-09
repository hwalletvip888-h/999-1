# `src/wallet-backend/` — 后端分层封装

## 模块一览

| 模块 | 职责 |
|------|------|
| `config.ts` | 端口、路径、OKX 密钥、`MAX_JSON_BODY_BYTES`、`CORS_ALLOWED_ORIGINS`、AI 限流、`META_CAPABILITIES_TOKEN` 等 |
| `cors.ts` | `HWALLET_CORS_ORIGINS` → `Access-Control-Allow-Origin` |
| `ai-rate-limit.ts` | `/api/ai/*` POST 按 IP 简单窗口限流 |
| `meta-auth.ts` | 可选：`GET /api/meta/capabilities` 的 `X-Hwallet-Meta-Token` |
| `cli-home.ts` | `emailToHash`、`homeForEmail`、`decodeSessionToken`、`homeFromToken` |
| `onchainos-cli.ts` | `isOnchainosCliAvailable`、`runOnchainosJson` |
| `okx-http.ts` | `okxSignedRequest`（WaaS 聚合余额 fallback） |
| `dex-tokens.ts` | `mapClientChainToCli`、`symbolToContract`、`pickSignerAddressForChain` |
| `wallet-cli-handlers.ts` | 所有钱包/DEX CLI 业务 handler |
| `admin-ops.ts` | 运维台鉴权、`listCliSandboxes`、`adminOverviewPayload` |
| `ai-handlers.ts` | `/api/ai/chat`、`/api/ai/intent` 薄封装；`recognizeIntent` 出口已 sanitize（见 `src/services/intentNormalize.ts`） |
| `http-utils.ts` | `parseBody` |
| `http-server.ts` | CORS、请求日志、`/ops` 与 `dispatchJsonRoutes` 编排 |
| `h1-capabilities.ts` | **`H1.skill.*` ↔ BFF 路径** 单一注册表 + JSON Schema（供 MCP / OpenAPI 生成） |
| `routes/` | 按域拆分：`meta-routes`（`GET /api/meta/capabilities`）、`ops-console-route`、`admin-routes`、`auth-routes`、`wallet-routes`、`dex-routes`、`ai-routes`、`health-route`、`index` 分发 |

## AI 对话 / 意图识别（服务端环境变量，勿写入 Expo）

由 `src/services/aiChat.ts` 读取，仅在 **钱包后端 Node 进程** 中生效：

| 变量 | 用途 |
|------|------|
| `CLAUDE_API_KEY` | Anthropic：意图识别主路径 |
| `DEEPSEEK_API_KEY` | DeepSeek：闲聊 `/api/ai/chat`；意图识别 fallback |
| `HWALLET_CLAUDE_INTENT_MODEL` | 意图 Claude 模型 id，默认 `claude-sonnet-4-20250514` |
| `HWALLET_DEEPSEEK_CHAT_MODEL` | 闲聊 DeepSeek 模型，默认 `deepseek-chat` |
| `HWALLET_DEEPSEEK_INTENT_MODEL` | 意图 fallback DeepSeek 模型，默认同闲聊模型 |
| `HWALLET_INTENT_MAX_TOKENS` | 意图 `max_tokens`，默认 `512`（clamp 128–4096） |
| `HWALLET_DEEPSEEK_CHAT_MAX_TOKENS` | 闲聊 `max_tokens`，默认 `1024`（clamp 256–8192） |

- **二者皆未配置**：意图识别走 **`localRuleIntent`**（`intentNormalize.ts`，与 App 无网路径同一套规则）；闲聊返回配置提示。
- **仅 DeepSeek**：跳过 Claude 请求，直接走 DeepSeek 意图或 `localRuleIntent`。
- 意图 JSON 返回前一律 **`sanitizeIntentPayload`**（白名单 + 字段边界）。

本地示例：`CLAUDE_API_KEY=sk-ant-... DEEPSEEK_API_KEY=sk-... npm run dev:wallet-backend`

密钥与上述变量请放在 **PM2 `env` / 宿主机环境**，勿写入 Expo `EXPO_PUBLIC_*`。

## HTTP 安全与治理（可选环境变量）

| 变量 | 默认 | 说明 |
|------|------|------|
| `HWALLET_CORS_ORIGINS` | `*` | 逗号分隔的浏览器 Origin；非 `*` 时仅回显白名单内 Origin |
| `HWALLET_MAX_JSON_BODY_BYTES` | `262144` | `parseBody` 拒绝超限 JSON，返回 **413** |
| `HWALLET_AI_RATE_LIMIT_MAX` | `120` | 每 IP 每窗口内允许 `/api/ai/*` **POST** 次数；`0` 关闭 |
| `HWALLET_AI_RATE_LIMIT_WINDOW_MS` | `60000` | 限流窗口毫秒 |
| `HWALLET_META_CAPABILITIES_TOKEN` | 空 | 若设置，拉能力表须带 **`X-Hwallet-Meta-Token`**（MCP 子进程设同名变量即可） |

BFF 访问日志会打印 **`X-Request-Id`**（若客户端传入）。

---

进程入口仍为 **`src/services/walletBackend.ts`**，便于现有脚本与 PM2 不改路径。

**MCP**：根目录 **`mcp-hwallet-server/`** 提供 stdio MCP，启动时读取 **`GET /api/meta/capabilities`** 并代理到 BFF；见该目录 `README.md`。

**App 侧**：`getHwalletApiBase` / `hwalletAbsoluteUrl` 在 **`walletApiCore.ts`**；HTTP 工具在 **`walletApiHttp.ts`**；`walletApi.ts` 仅会话与业务 API。`okxOnchain` 的 `callBackend` 只依赖 **`walletApiCore`**，避免循环依赖。
