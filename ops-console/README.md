# H Wallet 运维台（人类操作）

由 **`walletBackend`** 托管，与 App API 同进程、同端口。浏览器访问的 **`/ops` HTML 由后端在响应时生成**：读取仓库内 `ops-console/index.html` 作为模板，注入与 **`admin-api-catalog`** 中 **`ADMIN_OPS_API_DOCS`**、`admin-ops` 中 **`HTTP_ROUTE_CATALOG`** 一致的路由表及 `<script type="application/json" id="ops-bootstrap">`（内含 **`adminQuickGets`**、**`publicQuickLinks`**，供页内快捷入口；模板缺失时返回简短降级页。

## 快捷入口与错误提示（P2）

- **公开链接**：`/health`、`/ops` 在新标签打开（无需密钥）。
- **Admin GET**：同源 `fetch` + `X-Ops-Key`，成功时 JSON 出现在「快速预览」区。
- **错误文案**：503（未配置 token）、401/403、429、404、413、非 JSON 响应、超时、网络不可达等均有中文说明。

## 访问方式

1. 启动后端：`npm run dev:wallet-backend`（默认 `http://localhost:3100`）
2. 浏览器打开：**`http://localhost:3100/ops`**
3. 在服务器上设置环境变量 **`HWALLET_OPS_ADMIN_TOKEN`**（强随机字符串），重启后端。
4. 在运营页输入该密钥 → **保存** → 左侧切换视图后点击 **加载…** 拉取数据。

## Telegram 告警（可选）

1. 在 Telegram 与 [@BotFather](https://t.me/BotFather) 创建 Bot，拿到 **Bot Token**。
2. 与 Bot 私聊发一条 `/start`，用 `https://api.telegram.org/bot<TOKEN>/getUpdates` 查看 **`chat.id`**（群需先把 Bot 拉进群再发一条消息）。
3. 服务器环境变量：  
   `HWALLET_TELEGRAM_ALERT_BOT_TOKEN=<token>`  
   `HWALLET_TELEGRAM_ALERT_CHAT_ID=<id>`  
   可选：`HWALLET_TELEGRAM_ALERT_MIN_INTERVAL_MS`（默认 `120000`，同类型告警最小间隔）。
4. 重启 BFF 后，在运维台或 curl 调用 **`POST /api/admin/telegram-test`**（Header：`X-Ops-Key`）应收到测试消息。
5. **自动推送**：`dispatchJsonRoutes` 未捕获异常导致 **HTTP 500**、进程启动时 **onchainos CLI 不可用**、Node **`unhandledRejection` / `uncaughtException`**（均按 category 节流）。消息中**不含**密钥与完整请求体。

## 请求超时

页面向同源 `/api/admin/*` 的 `fetch` 使用 **28s** 超时（与仓库 `src/services/hwalletHttpConstants.ts` 中 `FETCH_TIMEOUT_MS` 对齐）；超时将提示检查后端是否可达。

## API（需 `X-Ops-Key: <token>`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/ping` | 校验密钥是否有效 |
| GET | `/api/admin/overview` | 健康检查、CLI 沙箱列表、脱敏配置快照 |
| GET | `/api/admin/system` | 进程 uptime、Node 版本、内存占用 |
| GET | `/api/admin/trend-status` | 趋势磁盘报告摘要（无数据时 `hasReport: false`） |
| GET | `/api/admin/diagnostics` | 聚合只读诊断：包版本、进程与内存、onchainos、CLI 沙箱数、趋势目录、运行时 JSON 文件元数据、HTTP 超时常量、功能开关、公开路由表（无密钥） |
| GET | `/api/admin/settings` | 运行时参数：文件路径、env 基线、当前生效值、已存覆盖项 |
| POST | `/api/admin/settings` | JSON body 合并写入运行时文件（字段见下）；`null` 清除该项覆盖 |
| POST | `/api/admin/telegram-test` | 向已配置的 Telegram `chat_id` 发送一条测试消息（需同时设置 `HWALLET_TELEGRAM_ALERT_BOT_TOKEN` 与 `HWALLET_TELEGRAM_ALERT_CHAT_ID`） |

`POST /api/admin/settings` 可写字段（均为可选；传 `null` 表示删除该键的覆盖）：

- `aiRateLimitMax`：整数 `0`～`100000`（`0` 关闭 AI POST 限流）
- `aiRateLimitWindowMs`：`1000`～`86400000`
- `maxJsonBodyBytes`：`1024`～`10485760`
- `corsAllowedOrigins`：字符串，与 `HWALLET_CORS_ORIGINS` 同格式（`*` 或逗号分隔 Origin）
- `trendOutputDir`：趋势 `report_*.json` 所在目录绝对路径
- `claudeIntentModel` / `deepseekChatModel` / `deepseekIntentModel`：模型 id 字符串（≤160 字符、无控制字符），对应 `HWALLET_CLAUDE_INTENT_MODEL`、`HWALLET_DEEPSEEK_CHAT_MODEL`、`HWALLET_DEEPSEEK_INTENT_MODEL`
- `deepseekChatMaxTokens`：`256`～`8192`（闲聊 `max_tokens`）
- `intentMaxTokens`：`128`～`4096`（意图 Claude / DeepSeek 的 `max_tokens`）
- `externalLlmFetchTimeoutMs`：`30000`～`300000`（`HWALLET_EXTERNAL_LLM_FETCH_TIMEOUT_MS`，第三方 LLM HTTP 超时）

**API Key**（`CLAUDE_API_KEY`、`DEEPSEEK_API_KEY`）不能通过此接口写入，仍须在服务器环境中配置；换 key 或换供应商通常需重启进程。

未设置 `HWALLET_OPS_ADMIN_TOKEN` 时，Admin API 返回 **503**；`/ops` 页面仍可打开，但无法拉取数据。

## 安全建议

- 生产环境仅 **内网或 VPN** 暴露 `/ops` 与 `/api/admin/*`，或由网关加 **IP 白名单 / mTLS**。
- 定期轮换 `HWALLET_OPS_ADMIN_TOKEN`。
- 沙箱目录名已是 **email 哈希前缀**，仍请勿对不可信人员开放运营台。
