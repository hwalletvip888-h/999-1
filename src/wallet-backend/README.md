# `src/wallet-backend/` — 后端分层封装

## 模块一览

| 模块 | 职责 |
|------|------|
| `config.ts` | 端口、路径、OKX 密钥、`MAX_JSON_BODY_BYTES`、`CORS_ALLOWED_ORIGINS`、AI 限流、`META_CAPABILITIES_TOKEN`、**`HWALLET_TELEGRAM_ALERT_*`** 等 |
| `cors.ts` | `HWALLET_CORS_ORIGINS` → `Access-Control-Allow-Origin` |
| `ai-rate-limit.ts` | `/api/ai/*` POST 按 IP 简单窗口限流 |
| `meta-auth.ts` | 可选：`GET /api/meta/capabilities` 的 `X-Hwallet-Meta-Token` |
| `cli-home.ts` | `emailToHash`、`homeForEmail`、`decodeSessionToken`、`homeFromToken` |
| `onchainos-cli.ts` | `isOnchainosCliAvailable`、`runOnchainosJson` |
| `okx-http.ts` | `okxSignedRequest`（WaaS 聚合余额 fallback） |
| `dex-tokens.ts` | `mapClientChainToCli`、`symbolToContract`、`pickSignerAddressForChain` |
| `wallet-cli-handlers.ts` | 所有钱包/DEX CLI 业务 handler |
| `admin-api-catalog.ts` | **`/api/admin/*` 路径 + 方法 + 文档** 单一表；`matchAdminRoute`、`ADMIN_OPS_API_DOCS`；`admin-routes` 分发须与此一致 |
| `admin-ops.ts` | 运维台鉴权、`listCliSandboxes`、`adminOverviewPayload`、**`adminDiagnosticsPayload`**（聚合只读诊断） |
| `runtime-settings.ts` | 工作台运行时 JSON 热覆盖：限流、JSON 体、CORS、trend、LLM 模型与 token、**externalLlmFetchTimeoutMs**；`aiChat` 每次请求读 `getEffective*` |
| `ai-handlers.ts` | `/api/ai/chat`、`/api/ai/intent` 薄封装；`recognizeIntent` 出口已 sanitize（见 `src/services/intentNormalize.ts`） |
| `http-utils.ts` | `parseBody` |
| `schemas/ai.ts`、`schemas/auth.ts` | **Zod** 校验 `/api/ai/*`、登录 OTP 请求体；路由层 400 返回结构化错误 |
| `schemas/walletDex.ts` | **Zod** 校验 `/api/v6/dex/*`、`/api/v6/wallet/send`、`/api/wallet/accounts/switch` 请求体 |
| `telegram-alert.ts` | **可选 Telegram 告警**：`notifyTelegramAlertThrottled`、`sendTelegramTestMessage`；与 `config` 中 `HWALLET_TELEGRAM_ALERT_*` 对齐 |
| `http-server.ts` | CORS、请求日志、`/ops` 与 `dispatchJsonRoutes` 编排；**未捕获异常 → 500 时**可选 Telegram 通知 |
| `h1-capabilities.ts` | **`H1.skill.*` ↔ BFF 路径** 单一注册表 + JSON Schema；**`buildBffHttpRouteCatalog()`** 生成运维/诊断用 HTTP 路由表（与注册表 + 固定端点一致） |
| `ops-console-html.ts` | **`GET /ops` HTML 生成**：读取 `ops-console/index.html` 模板，注入 `admin-api-catalog` 的 `ADMIN_OPS_API_DOCS`、`HTTP_ROUTE_CATALOG` 与 `ops-bootstrap` JSON（含 **`adminQuickGets`**、**`publicQuickLinks`**，与 Admin 表同源） |
| `routes/` | 按域拆分：`meta-routes`（`GET /api/meta/capabilities`）、`ops-console-route`、`admin-routes`、`auth-routes`、`wallet-routes`、`dex-routes`、`ai-routes`、`health-route`、`index` 分发 |

## AI 对话 / 意图识别（服务端环境变量，勿写入 Expo）

由 `src/services/aiChat.ts` 读取，仅在 **钱包后端 Node 进程** 中生效；**模型 id 与 max_tokens** 另可被 `runtime-settings.json`（`GET/POST /api/admin/settings`）热覆盖，优先级高于下表环境变量。

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
| `HWALLET_RUNTIME_SETTINGS_PATH` | （默认 `CLI_HOME_ROOT/runtime-settings.json`） | 持久化**运行时覆盖**；`GET/POST /api/admin/settings`；可覆盖 AI 限流、JSON 体、CORS、trend 目录、LLM 模型与 token、**`externalLlmFetchTimeoutMs`**（与 `HWALLET_EXTERNAL_LLM_FETCH_TIMEOUT_MS` 同源，热生效）。**API 密钥**（`CLAUDE_API_KEY` / `DEEPSEEK_API_KEY`）仍须只在环境变量中配置 |
| `HWALLET_TELEGRAM_ALERT_BOT_TOKEN` | 空 | 与 `HWALLET_TELEGRAM_ALERT_CHAT_ID` 同时设置时启用 **Telegram Bot 告警**（出站 `api.telegram.org`） |
| `HWALLET_TELEGRAM_ALERT_CHAT_ID` | 空 | 接收消息的 chat id（私聊 / 群 / 频道） |
| `HWALLET_TELEGRAM_ALERT_MIN_INTERVAL_MS` | `120000` | 同一告警 **category** 的最小发送间隔，防刷屏 |
| `HWALLET_BUILD_REVISION` | 空 | 可选；`GET /api/admin/diagnostics` 的 `buildRevision` 字段（镜像/部署注入 commit 或版本号） |
| `HWALLET_META_CAPABILITIES_TOKEN` | 空 | 若设置，拉能力表须带 **`X-Hwallet-Meta-Token`**（MCP 子进程设同名变量即可） |

密钥与上述变量请放在 **PM2 `env` / 宿主机环境**，勿写入 Expo `EXPO_PUBLIC_*`。

BFF 访问日志会打印 **`X-Request-Id`**（若客户端传入）。

---

进程入口仍为 **`src/services/walletBackend.ts`**，便于现有脚本与 PM2 不改路径。

**MCP**：根目录 **`mcp-hwallet-server/`** 提供 stdio MCP，启动时读取 **`GET /api/meta/capabilities`** 并代理到 BFF；见该目录 `README.md`。

**App 侧**：`getHwalletApiBase` / `hwalletAbsoluteUrl` 在 **`walletApiCore.ts`**；超时与 `X-Request-Id`、合并 **`AbortSignal`** 在 **`walletApiHttp.ts`**；`walletApi.ts` 仅会话与业务 API。`okxOnchain` 的 `callBackend` 使用 **`walletApiCore` + `walletApiHttp`**（与 `walletApiCore` 单向依赖，无环）。
