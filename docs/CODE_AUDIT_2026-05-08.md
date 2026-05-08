# 代码审核报告（2026-05-08）

## 1. 关键风险（已修复）

| # | 严重度 | 文件 | 问题 | 修复方式 |
|---|---|---|---|---|
| 1 | **致命** | `App.tsx:24` | 静态 `import { OKX_CONFIG } from "./src/config/okx.local"`，但该文件被 `.gitignore` 屏蔽，新克隆/CI 上 Metro 启动直接抛 `Cannot find module`，App 无法启动。 | 移除静态 import，改用 `loadOkxCredentials()` 安全加载。 |
| 2 | 严重 | `src/skills/*.test.ts` | 测试引用 `./registry`、`./manifests`、`./types`、`./bootstrap`、各 `index.ts` 等实现文件，但这些文件不在工作区（仅在 `claude-work-backup` 分支保留）。`tsc --noEmit` 22 处错误。 | 从 `56319c3` 检出实现文件回主线（registry / types / manifests / bootstrap + 5 个策略）。 |
| 3 | 严重 | `src/config/okxTypes.ts` vs `src/api/providers/okx/okxClient.ts` | 两份同名 `OkxCredentials` 类型字段不一致：前者 `apiSecret`，后者 `secretKey`。`okx.example.ts` 也用 `apiSecret`，运行时 `okxClient`/`gateway`/`H_AIEngine.okx` 用 `secretKey`，签名永远是 `undefined`。 | 统一到 `secretKey`：更新 `okxTypes.ts`、`okx.example.ts`、`isOkxConfigured`、`okxApi.ts:73`。 |
| 4 | 严重 | `App.tsx:78` | `OKX_CONFIG.secretKey` 与 `okxCredentials.apiSecret` 名字打架，`LiveAgentRunner` 拿到的 `apiSecret` 字段实际是 `undefined`。 | 改用 `creds.secretKey`（来自 `loadOkxCredentials()`）。 |

## 2. 设计/可读性观察（未在本次修改）

- `src/services/walletApi.ts:39`：`WALLET_API_BASE` 硬编码为 `http://localhost:3100`，无环境变量分支。建议读 `Constants.expoConfig?.extra?.WALLET_API_BASE`。
- `src/services/walletBackend.ts`：使用 `crypto.randomBytes` 直接 `sha256` 推导 EVM/Solana 地址，**这不是真实地址生成**，仅占位。生产期必须改用 OKX WaaS `create-wallet-account` 真签名结果。
- `src/data/mockData.ts`：`WalletScreen` 当前展示的资产仍来自 mock；session 落地后还没切换为真实 portfolio 接口。
- `src/skills/registry.test.ts`：`PLACEHOLDER_INPUT_SCHEMA` 还没拆出 per-skill JSON Schema，Phase 3 任务。

## 3. 验证

```
$ npx tsc --noEmit
（无输出 = 0 错误）
```

修复后 TypeScript strict 模式通过；Skills registry / 5 个策略测试文件可识别其引用模块。

## 4. 第一步功能：邮箱注册 → Agent Wallet 入口

落地点：

| 文件 | 改动 |
|---|---|
| `src/components/TopBar.tsx` | 左上角图标从 `MenuIcon`（汉堡菜单）→ `WalletIcon`，订阅 `useSession`，登录后右上角点亮绿色状态点表示"Agent Wallet 已就绪"。 |
| `src/screens/WalletScreen.tsx` | 顶部胶囊从硬编码 `"主账户 0x9a…3F2c"` → `"Agent Wallet  {session.addresses.evm[0].address slice}"`。未登录回落到 `"未登录"`。 |
| `src/screens/AuthScreen.tsx` | 已存在邮箱 → OTP → Agent Wallet 创建流程，未改动。 |

## 5. 接入方式决策

详见 [OKX_INTEGRATION_DECISION.md](./OKX_INTEGRATION_DECISION.md)。

结论：**前端 → 自有 Backend → OKX Web3 HTTP REST**，不在 RN 包里嵌 onchainos CLI / MCP server；
后端 LLM Worker 可叠加 onchainos-skills 给 Agent 调用。
