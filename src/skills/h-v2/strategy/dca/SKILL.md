---
name: h.v2.strategy.dca
description: "当用户表达定时定额买入 (DCA, Dollar-Cost Averaging) 意图时使用本技能,典型中文触发短语: '每周存 1000 块买 BTC', '每天买 100 USDT 的 ETH', '帮我定投 SOL', '每个月 1 号买点比特币', '我想做定投', '500 块每周自动买 OKB'。本技能会引导用户走完一个完整的 DCA 部署流程: 解析意图(单期金额/周期/标的/总预算或时长) → 缺字段时多轮追问(如周期没说时问'你想每天/每周/每月哪种') → 风险预审(总投入是否合理 / 标的是否在白名单) → 推送'AI 思考可见'确认卡片 → 用户确认后注册到后端定时调度器 → 每个周期触发 worker 调 okx-dex-swap.execute (一键流: quote→approve→swap→sign→broadcast) → SSE 实时通知 UI '✅ 已买入 X 个 Y'。不要用于: 1) 一次性买入('帮我买 1000U 的 BTC' 是单次 swap 不是定投), 2) 条件触发买 (用 h.v2.strategy.dip_buy), 3) 卖出 (用 h.v2.strategy.take_profit), 4) 跟单 (用 h.v2.strategy.copy_signal), 5) 稳定币理财 (用 h.v2.strategy.stable_yield), 6) 5 类之外的策略如网格/合约定投/期权 DCA(必须坦白拒绝并建议替代方案: 网格→V1.5 路线; 合约定投→V1.5 路线)。"
license: Apache-2.0
metadata:
  author: h-wallet
  version: "0.1.0"
  homepage: "https://github.com/hwalletvip888-h/999-1"
  agent:
    requires:
      hSkills: []
    backed_by:
      - okx-agentic-wallet
      - okx-wallet-portfolio
      - okx-dex-swap
      - okx-onchain-gateway
      - okx-security
    impl: "./index.ts"
    schemas:
      input: "./input.schema.json"
      output: "./output.schema.json"
    mvpType: 2
---

# H_V2 定投策略 (`h.v2.strategy.dca`)

> MVP 5 类策略 #2。详见 [ADR-0010](../../../../../docs/decisions/ADR-0010-mvp-scope-limited-to-5-strategy-types.md) §决策。

## 触发场景

用户表达"每 [周期] 买 [金额] [标的]"或同义表达。**用户没说"一次性"也没说条件价**就走 DCA。

## 输入参数

| 参数 | 必需 | 类型 | 缺时追问 |
|---|---|---|---|
| `targetAsset` | ✅ | string (token symbol) | "买什么? BTC / ETH / SOL ?" |
| `quoteAsset` | ❌ | string (default USDT) | (默认 USDT 不问) |
| `amountPerPeriod` | ✅ | string (decimal) | "每次买多少?" |
| `period` | ✅ | enum: daily \| weekly \| biweekly \| monthly | "每天 / 每周 / 每两周 / 每月 哪种?" |
| `totalBudget` | ❌ | string (decimal,可空表示无限) | (可空) |
| `endDate` | ❌ | ISO date \| null | (可空表示无限) |
| `chain` | ❌ | enum | (默认按标的常见链路推荐) |
| `slippageBps` | ❌ | integer (默认 50 = 0.5%) | (默认) |

## 风控前置

- ❌ `amountPerPeriod × 1 期` > 用户总余额 30% → 拒绝并建议降额
- ❌ 高频 (`period=daily`) + 高金额 → 警告 gas 成本占比可能过高
- ❌ 标的不在白名单 → 拒绝并建议主流币种 (USDC/USDT/BTC/ETH/SOL/OKB)
- ⚠️ `totalBudget` < 用户当前持仓余额 → 提醒"你账户可用 $X,本次定投仅用 $Y,确认?"

## 输出

```json
{
  "strategyId": "h-v2-dca-<uuid>",
  "type": "dca",
  "schedule": {
    "period": "weekly",
    "nextRunAt": "2026-05-11T00:00:00Z",
    "amountPerPeriod": "100",
    "quoteAsset": "USDT",
    "targetAsset": "BTC",
    "estimatedRunsLeft": 52
  },
  "expectedCost": {
    "amountPerPeriod": "100 USDT",
    "estimatedGas": "0.5 USD per run (Ethereum)",
    "totalRunsBeforeBudget": 52
  },
  "userConfirmRequired": true
}
```

## 详细流程 (Phase 3 实现时按此落地)

```
首次部署:
1. 用户确认门 → 入库 strategy + schedule
2. 后端定时调度器注册 next_run_at

每个周期触发 (cron worker):
3. okx-agentic-wallet status (检查 session)
4. okx-wallet-portfolio (检查余额够不够这一期)
5. okx-dex-swap quote --from QUOTE --to TARGET --readable-amount X --chain Y
6. (可选) okx-security token-scan (新标的或定期复扫)
7. okx-dex-swap execute (一键: quote→approve→swap→sign→broadcast)
8. 写入卡库 + SSE 通知 UI '✅ 已买入 0.0008 BTC, 均价 $124,500, 累计已投 $400 / 预算 $5200'
9. 更新 next_run_at 或标记 completed
```

参考 [03 §5.3 Type 2](../../../../../docs/research/03-onchainos-deep-dive.md)。

## 错误处理

- `NEXT_RUN_INSUFFICIENT_BALANCE` — 跳过本期 + 推送 SSE 提醒充值
- `NEXT_RUN_HIGH_SLIPPAGE` — 暂停后续周期 + 通知用户决定继续/调整
- `OKX_SESSION_EXPIRED` — 推送 SSE 让用户重新 OTP 登录,期间策略 paused

## 错误码

- `INSUFFICIENT_BALANCE` / `RISK_REJECTED` / `USER_CANCELED` / `OKX_SKILL_ERROR` / `SCHEDULE_INVALID`

## 收益预期表述合规

DCA 策略**不允许任何收益承诺**(连"目标月化"都不该写,因为 DCA 没有保证收益)。展示用"历史回测显示 X 个月内累计涨/跌 Y%"这种纯历史表述。
