# 钱包 BFF / 运维 / 封装层 — 分阶段备忘（给以后任何会话的 Agent 用）

> **用途**：用户希望「一个版块一个版块搞完、不赶进度」；又怕对话「失忆」。  
> **约定**：做 `src/wallet-backend`、`ops-console`、`src/services` 里与 BFF 相关改动前，**先扫一眼本文**，再动手。

---

## 已完成的版块（快照，可随提交更新）

- BFF 模块化路由、CORS、JSON 体上限、AI 限流、meta / trend / admin / auth / wallet / dex / ai / health。
- 人类运维台：`/ops` **服务端组装 HTML**（模板 `ops-console/index.html` + 注入），Admin API，`runtime-settings` 热参数。
- **`HTTP_ROUTE_CATALOG`** 由 **`h1-capabilities.buildBffHttpRouteCatalog()`** 从 **`H1_CAPABILITY_REGISTRY` + 固定端点** 生成，与 `/ops`、**`GET /api/admin/diagnostics`** 同源，减少双份维护。
- **`/api/admin/*`** 路径与运维页 Admin 表由 **`admin-api-catalog.ADMIN_API_ROUTE_SPECS`** 单一维护，`admin-routes` 通过 **`matchAdminRoute`** 分发。
- **`/ops` 运维台**：`ops-bootstrap` 含 **`adminQuickGets`**（与 catalog 同源的一键 GET）、**`publicQuickLinks`**（`/health`、`/ops`）；页内 **HTTP 状态 / 超时 / 非 JSON** 错误提示已文案化（P2）。
- **Telegram 运维告警（可选）**：`HWALLET_TELEGRAM_ALERT_BOT_TOKEN` + `HWALLET_TELEGRAM_ALERT_CHAT_ID`；`http-server` 未捕获路由异常 → 500、启动时 **onchainos CLI 不可用**、`unhandledRejection` / `uncaughtException` 会**按类型节流**推送（`HWALLET_TELEGRAM_ALERT_MIN_INTERVAL_MS`，默认 120s）；`POST /api/admin/telegram-test` 手动探活；**不落 token / chat_id 到消息外日志**。
- App 侧 `walletApi` / `hwalletBackendFetch` 与 BFF 路径对齐；`pingHwalletBackend` → `/health`。

---

## 待办版块（优先级自洽，可一项项勾掉）

下列顺序代表**建议**优先级（可随产品调整改序）；每一项都是「独立版块」，适合单独 PR / 单独聊天完成。

| 顺序 | 版块 | 内容摘要 | 状态 |
|------|------|----------|------|
| P1 | **Admin 文档与路由同源** | `admin-api-catalog.ts`：`ADMIN_API_ROUTE_SPECS` + `matchAdminRoute`；`admin-routes` 表驱动分发；`ADMIN_OPS_API_DOCS` 由同表生成 | **已完成** |
| P2 | **运维台体验** | 例如：`/ops` 内一键打开「当前 origin + 常用 Admin URL」、错误态更友好、可选暗色外主题（非必须） | **已完成** |
| P3 | **可观测性（安全）** | 结构化日志、按路径计数（内存环缓冲）、**不落密钥**；与现有 `X-Request-Id` 对齐；**Telegram 告警见上「已完成」** | 待办 |
| P4 | **BFF 集成测试** | 对关键路由做 `supertest` 式或 `node:http` 本机起服短测（鉴权、413、429、meta token） | 待办 |
| P5 | **`h1-platform` ↔ BFF** | 文档已写「尚未全量硬绑」；若要接：先定 **HTTP 契约 / 版本前缀**，再改 `h1-capabilities` 与 MCP 文档 | 远期 |
| P6 | **App 内入口** | 例如设置里「打开运维台」（`EXPO_PUBLIC_HWALLET_API_BASE` + `/ops` 系统浏览器）；纯产品决策 | 可选 |
| P7 | **网关其它供应商** | 如 `gateway.ts` 智谱分支等，与钱包 BFF **无关**，单独立项 | 远期 |

---

## 给以后 Agent 的一句话

**不要假设聊天里说过的话还在**：以 **git 与本文档** 为准；改完一个版块就 **更新上表「状态」** 并提交，用户最安心。

---

## 相关文件速查

| 主题 | 路径 |
|------|------|
| BFF 入口 | `src/services/walletBackend.ts` → `src/wallet-backend/http-server.ts` |
| 能力表 / 路由表生成 | `src/wallet-backend/h1-capabilities.ts` |
| Admin 路径与文档 | `src/wallet-backend/admin-api-catalog.ts` |
| Telegram 告警（可选） | `src/wallet-backend/telegram-alert.ts` |
| Admin + 诊断 + 公开路由聚合 | `src/wallet-backend/admin-ops.ts` |
| `/ops` HTML 组装 | `src/wallet-backend/ops-console-html.ts` |
| App 调 BFF | `src/api/providers/okx/onchain/hwalletBackendFetch.ts`、`src/services/walletApi*.ts` |
| 仓库总览 | `docs/H_WALLET_REPO_STRUCTURE.md` |
