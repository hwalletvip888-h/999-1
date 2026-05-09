# H1 Platform（分层封装）

本目录是 **与主 Expo App 解耦** 的 TypeScript 包，落实 [`../docs/H_WALLET_PRODUCT_DEV_REQUIREMENTS.md`](../docs/H_WALLET_PRODUCT_DEV_REQUIREMENTS.md) 中的分层与 **H1** 命名，便于后续接真实 OKX 接入与 REST/MCP。

## 讨论要点（落地映射）

| 概念 | 本包位置 |
|------|-----------|
| `H1.integration.okx` | `src/integration/okx.ts` |
| `H1.orchestration.intent` | `src/orchestration/intent.ts` |
| `H1.orchestration.execution` | `src/orchestration/execution.ts`（含 `h1.orchestration.execution.*` 事件名） |
| `H1.experience.chat` | `src/experience/chat.ts`（完成卡） |
| `H1.experience.controlCenter` | `src/experience/controlCenter.ts` |
| `H1.engagement.cardVault` | `src/engagement/cardVault.ts` |
| `H1.platform.audit` | `src/platform/audit.ts` |
| `H1.partner.directory` | `src/partner/directory.ts`（stub） |

对外 REST（`/api/v1/wallet/...`）**不在此包内起 HTTP 服务**；此处为 **域逻辑与契约**，后续在 `wallet-backend` 中暴露路由并调用 `runDemoTransferFlow` 的正式版（注入真实 `H1IntegrationOkx`）。

## 安装与测试

```bash
cd h1-platform
npm install
npm test
```

从仓库根目录：

```bash
npm run test:h1
```

## 入口 API

- **`runDemoTransferFlow`**（`src/index.ts`）：用户一句 → intent → plan → `runExecution` → 完成卡 → 卡库 → 审计计数。
- **`getControlCenterPreview`**：只读中控台摘要。

## 下一步（接真链）

1. 实现 `H1IntegrationOkx` 的 **生产类**（内部调用现有 `onchainos` CLI 或 BFF HTTP）。
2. 在 `wallet-backend` 增加 `/api/v1/trade/...` 与 MCP `H1.skill.*` 映射表。
3. 将 App 内调用逐步改为打 BFF，而非直接绑在 Screen 上。
