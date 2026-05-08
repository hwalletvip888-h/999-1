# OKX OnchainOS 接入决策

> 适用范围：H Wallet（React Native + Expo + AI 对话式聊天交易 App）
>
> 决策日期：2026-05-08
>
> 决策结论：**前端只通过自有 Backend → OKX HTTP REST API**，
>           可选叠加 **onchainos-skills（Rust CLI / MCP）作为 AI Agent 工具层**。

---

## 1. 三种官方接入方式对比

| 维度 | OKX HTTP REST (Web3 OpenAPI) | onchainos CLI（Rust） | onchainos-skills（MCP） |
|---|---|---|---|
| 形态 | RESTful HTTP（HMAC 签名） | 安装 Rust 二进制 + 命令行调用 | MCP server，Claude/Cursor 调用 |
| 适合谁 | 后端服务、移动端、Web | 开发者本地脚本、运维 | AI Agent、Claude Code 用户 |
| 移动端可直接用 | ✅ 通过自有 Backend 中转 | ❌ 不能在 RN 进程内运行二进制 | ❌ MCP 不在移动端运行 |
| 钱包/TEE 签名 | OKX WaaS 接口托管 TEE | CLI 调 WaaS / 本地签名 | 工具调 WaaS |
| 学习成本 | 低（普通 REST） | 中（Rust + CLI 安装） | 中（MCP 协议） |
| 可观测性 | 我们后端可全程审计 | 二进制黑盒 | 黑盒 |
| 受限风险 | 无 | 平台依赖 + 升级耦合 | 平台依赖 |

---

## 2. H Wallet 的最终架构

```
┌──────────────────────────────────────────────┐
│  React Native App（前端，本仓库）              │
│  ─ AuthScreen / TopBar / WalletScreen         │
│  ─ src/services/walletApi.ts → fetch 自有后端  │
└──────────────────────────────────────────────┘
                      ↓ HTTPS
┌──────────────────────────────────────────────┐
│  自有 Backend（src/services/walletBackend.ts） │
│  ─ /api/auth/send-otp                          │
│  ─ /api/auth/verify-otp                        │
│  ─ /api/wallet/addresses                       │
│  ─ HMAC-SHA256 签名 + OK-ACCESS-* 头           │
└──────────────────────────────────────────────┘
                      ↓ HTTPS（签名）
┌──────────────────────────────────────────────┐
│  OKX Web3 OpenAPI（HTTP REST）                  │
│  ─ /api/v5/wallet/account/create-wallet-account│
│  ─ /api/v5/wallet/account/get-account-detail   │
│  ─ /api/v5/wallet/portfolio/...                │
│  ─ /api/v5/dex/aggregator/...（DEX 路由）      │
│  ─ /api/v5/wallet/transaction/sign（TEE 签名） │
└──────────────────────────────────────────────┘

可选叠加：
┌──────────────────────────────────────────────┐
│  onchainos-skills（MCP）                        │
│  ─ 仅在"开发期 / 后端 Agent 服务"使用           │
│  ─ 给 Claude/Cursor 提供 DApp 路由能力         │
│  ─ 不进入 RN 包                                 │
└──────────────────────────────────────────────┘
```

---

## 3. 为什么这样选

### 为什么前端不直接调 OKX

1. **私钥安全**：API Secret 一旦下发到 RN bundle 等于公开。
2. **可观测**：所有真金请求必须过我们自己的后端，便于做风控/限流/审计日志。
3. **凭证轮换**：OKX Key 过期/换 Builder Code 时改一处，App 无需发版。

### 为什么不走 onchainos CLI

- React Native 不能 spawn Rust 二进制；
- 即使在 Backend 端用 CLI，也是把"清晰的 HTTP 调用"换成"命令行字符串拼接"，鉴权/错误处理还更脏。

### 为什么仍保留 onchainos-skills 作为可选

- 在 **AI 对话式聊天交易** 场景里，Claude/我们自有 LLM 可以用 MCP 协议直接调用 `okx-dex-swap / okx-defi-invest / okx-agentic-wallet` 等技能。
- 这些工具调用可以放在 **后端 LLM Worker**（Node + MCP client），返回结果给前端展示卡片。
- 前端 RN 包不需要任何 onchainos 依赖。

---

## 4. Email → Agent Wallet 创建流程（已落地）

```
[AuthScreen]
  ↓ 输入邮箱
walletApi.sendOtp(email)
  → POST {backend}/api/auth/send-otp
    → 后端生成 6 位 OTP（开发期直接打日志，生产期发邮件）
  ↓
[OtpStep] 用户输入验证码
  ↓
walletApi.verifyOtp(email, code)
  → POST {backend}/api/auth/verify-otp
    → 后端校验 OTP
    → 后端 POST /api/v5/wallet/account/create-wallet-account
      → OKX 在 TEE 里生成 EVM + Solana 私钥
      → 返回 accountId + 多链地址列表
  ← { token, accountId, addresses, isNew }
  ↓
sessionStore.set(session) → AsyncStorage 持久化
  ↓
App.tsx 检测到 session → 切到主页（顶部三入口）
  ↓
TopBar 左侧 WalletIcon
  + 登录态绿色小点（已生成 Agent Wallet）
  ↓ 点击
WalletScreen 头部胶囊显示 "Agent Wallet · 0xAbCd…1234"
（来自 session.addresses.evm[0].address）
```

---

## 5. 凭证文件约定

```
src/config/
  okx.example.ts     # 模板，提交（导出 OKX_CONFIG）
  okx.local.ts       # 实际密钥，gitignore（导出 OKX_CONFIG / 兼容 okxCredentials）
  okx.ts             # loadOkxCredentials() 安全加载入口
  okxTypes.ts        # OkxCredentials 类型（apiKey / secretKey / passphrase）
```

字段命名 **统一使用 `secretKey`**（与 `src/api/providers/okx/okxClient.ts` 一致）。

---

## 6. 后续计划

| 阶段 | 内容 |
|---|---|
| MVP-1（当前） | Email OTP → Agent Wallet → 顶部入口显示真实地址 |
| MVP-2 | WalletScreen 资产列表接 `/api/v5/wallet/portfolio/...` |
| MVP-3 | 对话页接 `okx-dex-swap` / `okx-defi-invest` 技能 |
| MVP-4 | TEE 签名链路全闭环：用户在卡片里"确认" → 后端调 WaaS 签名 → 上链 |
| MVP-5 | Builder Code 接入：DEX 路由订单全部带 `builderCode` 头 |
