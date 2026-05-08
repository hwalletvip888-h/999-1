---
name: h.v2.strategy.stable_yield
description: "当用户表达想用稳定币赚取稳定/被动收益时使用本技能,典型中文触发短语: '帮我赚稳定收益', '我想存 USDC 吃利息', '帮我用稳定币理财', '把闲钱放在能赚钱的地方', '5000 U 放 3 个月赚点利息', '存稳定币最高 APY 在哪', '把 USDT 拿去赚收益'。本技能会引导用户走完一个完整的稳定收益部署流程: 解析意图(金额/期限/最大波动/链偏好) → 缺字段时多轮自然语言追问 → 调 okx-defi-invest search 找当前白名单内 top APY 的稳定币池 → 调 okx-security token-scan 飞行前安全扫描 → 估算预期收益区间(必带历史最低/最高/极端情况修饰) → 推送'AI 思考可见'确认卡片 → 用户确认后调 okx-defi-invest deposit 部署到 1-3 个池分散 → onchain-gateway 广播 → 写卡库 + SSE 通知 UI → 注册到后端策略引擎做后续监控/复盘。不要用于: 1) 单次代币兑换 (用 h.v2.strategy.dca 或直接 swap), 2) 条件触发买入 (用 h.v2.strategy.dip_buy), 3) 卖出/平仓 (用 h.v2.strategy.take_profit), 4) 跟单 (用 h.v2.strategy.copy_signal), 5) 5 类之外的策略如马丁格尔/三角套利/做市等(必须坦白拒绝并建议替代方案)。"
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
      - okx-defi-invest
      - okx-security
      - okx-onchain-gateway
    impl: "./index.ts"
    schemas:
      input: "./input.schema.json"
      output: "./output.schema.json"
    mvpType: 1
---

# H_V2 稳定收益策略 (`h.v2.strategy.stable_yield`)

> MVP 5 类策略 #1。详见 [ADR-0010](../../../../../docs/decisions/ADR-0010-mvp-scope-limited-to-5-strategy-types.md) §决策。

## 触发场景

用户用一句中文表达想拿稳定币赚被动收益,**未指名特定协议**(指名 Aave/Lido 等时改走 `okx-dapp-discovery`)。

## 输入参数

| 参数 | 必需 | 类型 | 缺时怎么处理 | 默认 |
|---|---|---|---|---|
| `amount` | ✅ | 字符串 (decimal) | 多轮追问: "想存多少?" | — |
| `asset` | ✅ | enum: USDC \| USDT \| DAI | 缺时追问 + 默认 USDC | USDC |
| `term` | ✅ | "随时取" \| 天数 (整数) | 追问: "多久不动?" | 随时取 |
| `chain` | ❌ | enum: ethereum \| bsc \| solana \| ... | 默认主流链按 APY 推荐 | 后端按 APY+TVL 选 |
| `maxVolatility` | ❌ | "low" \| "medium" \| "high" | 追问: "能接受最多损失多少?" | low |
| `splitInto` | ❌ | 整数 1-3 | 默认 3 池分散 | 3 |

## 输入风控前置 (`RiskLayer.preCompileCheck`)

- ❌ `amount` > 用户总余额 30% → 强制确认门 + 推荐降到 30% 以内
- ❌ 极端 `maxVolatility=high` 配 `term≥90天` → 警告"长期高波动可能远超预期"
- ❌ 单笔 > 用户 OKX wallet `policy.singleTxLimit` (per ADR-0001/04 + cli-reference) → 拒绝
- ❌ 当日累计 + 本笔 > `policy.dailyTradeTxLimit` → 拒绝并解释

## 输出 (StrategyPlan)

```json
{
  "strategyId": "h-v2-stable-yield-<uuid>",
  "type": "stable_yield",
  "expectedRisk": {
    "expectedApyRange": ["3.1%", "6.2%"],
    "historicalMinApy": "1.8%",
    "historicalMaxApy": "8.4%",
    "extremeNote": "极端市场情况下短期可能为负 (per 挑战 4 合规)"
  },
  "executionPlan": [
    { "step": 1, "skill": "okx-defi-invest", "command": "search", ... },
    { "step": 2, "skill": "okx-defi-invest", "command": "detail", ... },
    { "step": 3, "skill": "okx-security",    "command": "token-scan", ... },
    { "step": 4, "skill": "okx-defi-invest", "command": "prepare", ... },
    { "step": 5, "skill": "h.internal",      "command": "user-confirm-card", ... },
    { "step": 6, "skill": "okx-defi-invest", "command": "deposit", ... },
    { "step": 7, "skill": "okx-onchain-gateway", "command": "broadcast", ... }
  ],
  "selectedPools": [
    { "investmentId": "...", "platform": "Aave V3", "apy": "5.2%", "allocation": "33%" },
    ...
  ],
  "userConfirmRequired": true
}
```

## 错误码

- `INSUFFICIENT_BALANCE` — 余额不足,UI 提示充值或降额
- `RISK_REJECTED` — 风控拒绝(意图风控门),给替代方案
- `USER_CANCELED` — 用户在确认卡片阶段取消(不算错误)
- `NO_QUALIFIED_POOL` — 当前没有满足白名单 + 风险等级的池(罕见)
- `OKX_SKILL_ERROR` — 透传 OKX skill 报错,Claude 翻译成中文

## 详细流程 (Phase 3 实现时按此落地)

参考 [03 §5.3 Type 1](../../../../../docs/research/03-onchainos-deep-dive.md) 给出的 11 步精确编排。

## 收益预期表述合规校验

任何展示给用户的"月化 X%""年化 X%"必须经 `compliance-rules.yaml` 校验:
- ✅ "目标月化 5% (该协议过去 12 个月平均 6.2%, 最低 3.1%, 极端情况下可能为负)"
- ❌ "稳赚月化 5%" / "本金安全" / "无风险" / "至少 5%"

详见 [ADR-0009 挑战 4](../../../../../docs/decisions/ADR-0009-natural-language-strategy-compiler.md)。
