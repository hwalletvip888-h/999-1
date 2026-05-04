# H Wallet V5 / V6 双产品能力封装 Skill

**文档版本**：v1.0  
**日期**：2026-05-03  
**用途**：把 V5 与 V6 两套能力拆成 H Wallet 平台内的两个独立产品线，供 Claude Code / 后端 / 前端按边界开发。  

---

## 0. 核心结论

V5 和 V6 不再混成一个“大交易模块”。

H Wallet 平台采用：

```text
一个 H Wallet App
两个产品能力
一套统一 AI 入口
一套统一卡片系统
一套统一用户、卡库、风控、社区体系
```

两条产品线：

```text
产品一：H Wallet V5 Product
定位：交易所侧 / 策略交易能力产品
核心：行情、账户、永续合约、网格策略、持仓、订单

产品二：H Wallet V6 Product
定位：链上侧 / 钱包与链上资产能力产品
核心：Agent Wallet、链上资产、DEX 兑换、链上赚币、质押、链上安全检查
```

注意：这里的 V5 / V6 是 H Wallet 内部产品线代号，不是 App 版本号。

---

## 1. 产品边界

### 1.1 H Wallet V5 Product

**用户感知名称建议**：智能交易  
**内部代号**：V5 Product  
**一句话定位**：让用户用中文对话完成合约、网格、账户和行情相关操作。  

适合承接的用户指令：

```text
帮我用 100 USDT 开 ETH 永续合约做多
帮我开一个 ETH/USDT 网格策略
查一下我的合约持仓
ETH 现在资金费率是多少
帮我平掉 ETH 多单
```

V5 Product 负责：

| 能力 | 是否第一阶段接入 | 用户展示卡片 |
|---|---:|---|
| 行情价格 | 是 | 文本 / 行情摘要 |
| 永续合约预览 | 是 | 交易卡片 |
| 永续合约模拟执行 | 是 | 交易卡片 |
| 永续合约真实执行 | 后置 | 交易卡片 |
| 合约网格预览 | 是 | 策略卡片 |
| 合约网格模拟启动 | 是 | 策略卡片 |
| 合约网格真实启动 | 后置 | 策略卡片 |
| 持仓查询 | 是 | 持仓摘要 |
| 订单历史 | 是 | 卡库记录 |
| 现货交易 | 后置 | 交易卡片 |
| 期权 / 交割 | 暂不接入 | 不展示 |

---

### 1.2 H Wallet V6 Product

**用户感知名称建议**：智能钱包 / 链上资产  
**内部代号**：V6 Product  
**一句话定位**：让用户用中文对话完成链上钱包、DEX 兑换、链上赚币和链上资产管理。  

适合承接的用户指令：

```text
帮我创建钱包
查一下我的链上资产
帮我用 100 USDT 买 ETH
帮我把 100 USDT 放去链上赚币
帮我转 50 USDT 到这个地址
检查一下这个代币安全吗
```

V6 Product 负责：

| 能力 | 是否第一阶段接入 | 用户展示卡片 |
|---|---:|---|
| 钱包初始化 | 是 | 钱包状态卡 |
| 链上资产查询 | 是 | 资产摘要 |
| DEX 兑换预览 | 是 | 交易卡片 |
| DEX 兑换模拟执行 | 是 | 交易卡片 |
| DEX 兑换真实执行 | 后置 | 交易卡片 |
| 链上赚币产品查询 | 是 | 策略卡片 |
| 链上赚币模拟存入 | 是 | 策略卡片 |
| 链上赚币真实存入 | 后置 | 策略卡片 |
| 质押 | 后置 | 策略卡片 |
| 转账预览 | 是 | 钱包操作卡 |
| 转账真实执行 | 后置 | 钱包操作卡 |
| 安全扫描 | 是 | 风险提示 |

---

## 2. 平台层与产品层分工

### 2.1 平台层：H Wallet Core

平台层不属于 V5，也不属于 V6。它是两个产品共同复用的底座。

| 平台模块 | 职责 |
|---|---|
| AI Router | 判断用户意图应该进入 V5 Product 还是 V6 Product |
| AI Engine | 解析中文指令，生成结构化参数 |
| Card System | 统一生成交易卡片、策略卡片、钱包操作卡 |
| Card Library | 保存所有卡片记录 |
| User System | 用户、会员、安全设置 |
| Risk Center | 统一风控预检查 |
| Community | 群聊、热点、卡片分享 |
| Admin Dashboard | 策略监控、用户资产大盘、AI 模型切换 |

### 2.2 产品层：V5 / V6

V5 和 V6 只负责各自产品能力，不互相调用。

```text
前端 App
  ↓
H Wallet Core
  ↓
AI Router
  ├── V5 Product API
  └── V6 Product API
```

---

## 3. API 命名规范

不要用 `/api/v5` 和 `/api/v6` 表示“接口版本”，否则以后会混乱。

推荐使用：

```text
/api/products/v5/*
/api/products/v6/*
```

含义是“产品能力”，不是“API 版本”。

接口版本另行使用：

```text
/api/core/v1/*
/api/products/v5/v1/*
/api/products/v6/v1/*
```

---

## 4. 平台 Core API

这些接口两个产品都复用。

| 接口 | 作用 |
|---|---|
| `POST /api/core/v1/ai/chat` | 用户对话入口 |
| `POST /api/core/v1/ai/route-product` | 判断进入 V5 还是 V6 |
| `POST /api/core/v1/ai/parse-intent` | 解析中文意图 |
| `POST /api/core/v1/cards` | 创建卡片记录 |
| `GET /api/core/v1/cards` | 查询卡库 |
| `PATCH /api/core/v1/cards/:id/status` | 更新卡片状态 |
| `POST /api/core/v1/risk/precheck` | 平台统一风控预检查 |
| `GET /api/core/v1/user/profile` | 用户资料 |
| `PUT /api/core/v1/user/settings` | 用户设置 |

---

## 5. V5 Product API

### 5.1 行情与账户

| 接口 | 作用 | 第一阶段 |
|---|---|---:|
| `GET /api/products/v5/v1/market/price` | 查询交易对价格 | 是 |
| `GET /api/products/v5/v1/market/candles` | 查询 K 线 | 是 |
| `GET /api/products/v5/v1/market/funding-rate` | 查询资金费率 | 是 |
| `GET /api/products/v5/v1/account/assets` | 查询交易账户资产 | 是 |
| `GET /api/products/v5/v1/account/positions` | 查询持仓 | 是 |

### 5.2 永续合约

| 接口 | 作用 | 第一阶段 |
|---|---|---:|
| `POST /api/products/v5/v1/perpetual/preview` | 生成永续合约交易预览 | 是 |
| `POST /api/products/v5/v1/perpetual/execute-simulated` | 模拟执行永续交易 | 是 |
| `POST /api/products/v5/v1/perpetual/execute` | 真实执行永续交易 | 后置 |
| `POST /api/products/v5/v1/perpetual/close-simulated` | 模拟平仓 | 是 |
| `POST /api/products/v5/v1/perpetual/close` | 真实平仓 | 后置 |

### 5.3 网格策略

| 接口 | 作用 | 第一阶段 |
|---|---|---:|
| `POST /api/products/v5/v1/grid/preview` | 生成网格策略预览 | 是 |
| `POST /api/products/v5/v1/grid/start-simulated` | 模拟启动网格策略 | 是 |
| `POST /api/products/v5/v1/grid/start` | 真实启动网格策略 | 后置 |
| `POST /api/products/v5/v1/grid/stop-simulated` | 模拟停止网格策略 | 是 |
| `POST /api/products/v5/v1/grid/stop` | 真实停止网格策略 | 后置 |
| `GET /api/products/v5/v1/grid/orders` | 查询网格策略列表 | 是 |

---

## 6. V6 Product API

### 6.1 钱包与资产

| 接口 | 作用 | 第一阶段 |
|---|---|---:|
| `POST /api/products/v6/v1/wallet/init` | 初始化智能钱包 | 是 |
| `GET /api/products/v6/v1/wallet/assets` | 查询链上资产 | 是 |
| `GET /api/products/v6/v1/wallet/history` | 查询链上历史 | 是 |
| `POST /api/products/v6/v1/wallet/transfer-preview` | 转账预览 | 是 |
| `POST /api/products/v6/v1/wallet/transfer-simulated` | 模拟转账 | 是 |
| `POST /api/products/v6/v1/wallet/transfer` | 真实转账 | 后置 |

### 6.2 DEX 兑换

| 接口 | 作用 | 第一阶段 |
|---|---|---:|
| `POST /api/products/v6/v1/swap/preview` | 链上兑换预览 | 是 |
| `POST /api/products/v6/v1/swap/execute-simulated` | 模拟链上兑换 | 是 |
| `POST /api/products/v6/v1/swap/execute` | 真实链上兑换 | 后置 |
| `GET /api/products/v6/v1/swap/routes` | 查询兑换路由 | 是 |

### 6.3 链上赚币与质押

| 接口 | 作用 | 第一阶段 |
|---|---|---:|
| `GET /api/products/v6/v1/earn/products` | 查询链上赚币产品 | 是 |
| `POST /api/products/v6/v1/earn/preview` | 生成赚币策略预览 | 是 |
| `POST /api/products/v6/v1/earn/subscribe-simulated` | 模拟存入赚币策略 | 是 |
| `POST /api/products/v6/v1/earn/subscribe` | 真实存入赚币策略 | 后置 |
| `POST /api/products/v6/v1/earn/withdraw-simulated` | 模拟取回 | 是 |
| `POST /api/products/v6/v1/earn/withdraw` | 真实取回 | 后置 |
| `GET /api/products/v6/v1/earn/positions` | 查询赚币持仓 | 是 |

### 6.4 链上安全

| 接口 | 作用 | 第一阶段 |
|---|---|---:|
| `POST /api/products/v6/v1/security/token-scan` | 代币安全扫描 | 是 |
| `POST /api/products/v6/v1/security/tx-precheck` | 交易预检查 | 是 |
| `POST /api/products/v6/v1/security/dapp-scan` | DApp 风险扫描 | 后置 |

---

## 7. AI 路由规则

### 7.1 路由到 V5 Product

用户输入包含以下意图时，优先进入 V5：

```text
永续
合约
杠杆
做多
做空
平仓
持仓
网格
资金费率
订单
交易账户
```

示例：

```text
帮我用 100 USDT 开 ETH 永续合约做多
→ V5 Product
→ 交易卡片

帮我开一个 ETH/USDT 网格策略
→ V5 Product
→ 策略卡片
```

### 7.2 路由到 V6 Product

用户输入包含以下意图时，优先进入 V6：

```text
钱包
链上
DEX
兑换
Swap
转账
提现
充值
赚币
理财
质押
安全扫描
代币风险
```

示例：

```text
帮我用 100 USDT 在链上买 ETH
→ V6 Product
→ 交易卡片

帮我把 100 USDT 放去链上赚币
→ V6 Product
→ 策略卡片
```

### 7.3 模糊意图处理

当用户只说：

```text
帮我用 100 USDT 买 ETH
```

不能直接执行。AI 应回复澄清问题：

```text
你想通过哪种方式买入 ETH？
1. 链上兑换：使用智能钱包在链上兑换 ETH
2. 交易账户：使用交易账户买入或开仓相关产品
```

---

## 8. 卡片系统规则

所有卡片都必须包含产品来源字段，但用户界面可以不展示产品代号。

```ts
type ProductLine = "v5" | "v6";
type CardKind = "trade" | "strategy" | "wallet" | "risk";

type HWalletCard = {
  id: string;
  productLine: ProductLine;
  kind: CardKind;
  header: "交易卡片" | "策略卡片" | "钱包操作卡" | "风险提示";
  title: string;
  symbol?: string;
  pair?: string;
  amount?: number;
  currency?: "USDT" | "USDC" | "ETH" | "BTC" | "HWT";
  status:
    | "preview"
    | "risk_checking"
    | "ready_to_confirm"
    | "confirming"
    | "executed"
    | "cancelled"
    | "failed";
  simulationMode: boolean;
  userPrompt: string;
  aiSummary: string;
  createdAt: string;
  executedAt?: string;
};
```

卡片抬头规则：

| 操作类型 | 产品线 | 卡片抬头 |
|---|---|---|
| 永续合约 | V5 | 交易卡片 |
| 现货买卖 | V5 | 交易卡片 |
| 网格策略 | V5 | 策略卡片 |
| 链上兑换 | V6 | 交易卡片 |
| 链上赚币 | V6 | 策略卡片 |
| 质押 | V6 | 策略卡片 |
| 钱包转账 | V6 | 钱包操作卡 |
| 风险扫描 | V6 | 风险提示 |

---

## 9. 安全与执行规则

1. V5 和 V6 的密钥、凭证、权限完全分开。
2. 前端不保存任何第三方 API key。
3. 前端不直接调用底层 V5 / V6 能力。
4. 所有执行类接口默认 `simulationMode = true`。
5. 真实执行必须用户二次确认。
6. 真实执行必须有 `idempotencyKey`。
7. 风控未通过，不允许展示执行按钮。
8. V5 的失败不能影响 V6 钱包资产查询。
9. V6 的链上失败不能影响 V5 持仓查询。
10. 卡库必须记录产品来源：`productLine = "v5" | "v6"`。

---

## 10. 开发顺序

### 第 1 步：平台 Core Mock

先做：

```text
AI Router
Card System
Card Library
User Profile
Risk Center Mock
```

### 第 2 步：V5 Product Mock

先做：

```text
永续合约预览
永续合约模拟执行
网格策略预览
网格策略模拟启动
持仓查询 Mock
```

### 第 3 步：V6 Product Mock

先做：

```text
钱包初始化 Mock
链上资产 Mock
DEX 兑换预览 Mock
链上赚币产品 Mock
链上安全检查 Mock
```

### 第 4 步：V5 真实只读

先接：

```text
行情
资金费率
账户资产
持仓
订单历史
```

### 第 5 步：V6 真实只读

先接：

```text
智能钱包状态
链上资产
链上历史
赚币产品
安全扫描
```

### 第 6 步：模拟执行

V5 和 V6 都先跑模拟执行，不碰真实资金。

### 第 7 步：真实执行灰度

真实执行必须灰度开放，并且按产品线分开：

```text
先 V5 小额模拟盘 / 受限用户
再 V6 小额链上测试
最后逐步开放真实资金操作
```

---

## 11. 给 Claude Code 的执行指令

```text
请按照 H Wallet V5 / V6 双产品能力封装 Skill 开发 API service 层。

重要：
V5 和 V6 是两个独立产品能力，不是同一个模块，也不是 App 版本号。

这次只做 Mock service，不接真实 API，不真实下单，不真实转账，不重构 UI。

请新增或整理以下文件：

src/types/product.ts
src/types/card.ts
src/services/core/aiRouter.ts
src/services/core/cardsApi.ts
src/services/core/riskApi.ts
src/services/products/v5/v5MarketApi.ts
src/services/products/v5/v5PerpetualApi.ts
src/services/products/v5/v5GridApi.ts
src/services/products/v5/v5AccountApi.ts
src/services/products/v6/v6WalletApi.ts
src/services/products/v6/v6SwapApi.ts
src/services/products/v6/v6EarnApi.ts
src/services/products/v6/v6SecurityApi.ts

要求：
1. V5 和 V6 service 文件必须分开。
2. V5 不允许调用 V6 service。
3. V6 不允许调用 V5 service。
4. AI Router 负责判断用户输入进入哪个产品线。
5. 卡片必须带 productLine 字段。
6. 用户界面中文，币种和交易对保留英文。
7. 永续、买卖、兑换显示“交易卡片”。
8. 网格、赚币、质押显示“策略卡片”。
9. 所有执行接口默认 simulationMode = true。
10. 真实执行接口先只保留函数签名，内部抛出“真实执行暂未开放”。

完成后请告诉我：
- 新增了哪些文件
- V5 Product 有哪些 Mock 接口
- V6 Product 有哪些 Mock 接口
- AI Router 如何判断进入 V5 或 V6
- 如何测试生成交易卡片和策略卡片
```

---

## 12. 验收标准

| 测试输入 | 期望产品线 | 期望卡片 |
|---|---|---|
| 帮我用 100 USDT 开 ETH 永续合约做多 | V5 | 交易卡片 |
| 帮我开 ETH/USDT 网格策略 | V5 | 策略卡片 |
| 查询我的合约持仓 | V5 | 持仓摘要 |
| 帮我用 100 USDT 在链上买 ETH | V6 | 交易卡片 |
| 帮我把 100 USDT 放去链上赚币 | V6 | 策略卡片 |
| 帮我创建钱包 | V6 | 钱包操作卡 |
| 检查这个代币安全吗 | V6 | 风险提示 |
| 帮我用 100 USDT 买 ETH | 澄清 | 询问链上兑换还是交易账户 |
