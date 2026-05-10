# H Wallet 运维台（人类操作）

由 **`walletBackend`** 托管，与 App API 同进程、同端口。浏览器访问的 **`/ops` HTML 由后端在响应时生成**：读取仓库内 `ops-console/index.html` 作为模板，注入与 **`admin-api-catalog`** 中 **`ADMIN_OPS_API_DOCS`**、`admin-ops` 中 **`HTTP_ROUTE_CATALOG`** 一致的路由表及 `<script type="application/json" id="ops-bootstrap">`（便于后续前端扩展）；模板缺失时返回简短降级页。

## 访问方式

1. 启动后端：`npm run dev:wallet-backend`（默认 `http://localhost:3100`）
2. 浏览器打开：**`http://localhost:3100/ops`**
3. 在服务器上设置环境变量 **`HWALLET_OPS_ADMIN_TOKEN`**（强随机字符串），重启后端。
4. 在运营页输入该密钥 → **保存** → 左侧切换视图后点击 **加载…** 拉取数据。

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
