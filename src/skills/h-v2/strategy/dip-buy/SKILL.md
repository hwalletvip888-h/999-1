---
name: h.v2.strategy.dip_buy
description: "当用户表达'跌到某价格帮我买'的条件触发抄底意图时使用本技能,典型中文触发短语: '跌到 5 万帮我买 BTC', 'BTC 跌到 90000 我要进 5000 U', '以太到 3000 帮我抄底 1 万 U', '帮我抄底 SOL', '下跌 10% 帮我买'(此种相对触发也接受), '比特币跌破 8 万买入'。本技能引导用户走完一个完整的条件抄底部署流程: 解析意图(标的/触发价或触发条件/单次金额/是否分批) → 缺字段时多轮追问(如金额没说时问'用多少钱抄?') → 风险预审(总投入是否合理 / 触发价是否离谱 / 是否在余额范围内) → 推送'AI 思考可见'确认卡片 → 用户确认后注册到后端价格监听 worker → worker 周期(默认 30s)调 okx-dex-market.price 检查 → 触发后调 okx-dex-swap.execute (一键流) → SSE 实时通知用户。不要用于: 1) 立即一次性买入(不带触发价 → 走单次 swap), 2) 周期定投 (用 h.v2.strategy.dca), 3) 卖出/止盈 (用 h.v2.strategy.take_profit), 4) 跟单 (用 h.v2.strategy.copy_signal), 5) 稳定币理财 (用 h.v2.strategy.stable_yield), 6) 5 类之外的复杂条件如'跌破 EMA20 后 RSI<30 才买'(必须坦白拒绝: 复杂指标条件需要 V1.5/V2.0,建议简化为单一价格触发)。"
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
      - okx-dex-market
      - okx-dex-swap
      - okx-onchain-gateway
      - okx-security
    impl: "./index.ts"
    schemas:
      input: "./input.schema.json"
      output: "./output.schema.json"
    mvpType: 3
---

# H_V2 条件抄底策略 (`h.v2.strategy.dip_buy`)

> MVP 5 类策略 #3。详见 [ADR-0010](../../../../../docs/decisions/ADR-0010-mvp-scope-limited-to-5-strategy-types.md) §决策。

## 触发场景

用户用一句中文描述"价格到 X 时帮我买 Y 金额的 Z"。

支持两种触发模式:
- **绝对价**: "BTC 跌到 90000 帮我买"
- **相对跌幅**: "BTC 再跌 10% 帮我买" (内部转换为绝对价 = 当前价 × 0.9)

## 输入参数

| 参数 | 必需 | 类型 | 缺时追问 |
|---|---|---|---|
| `targetAsset` | ✅ | string | "抄什么? BTC / ETH / SOL ?" |
| `quoteAsset` | ❌ | string (default USDT) | — |
| `triggerPrice` | ✅ | string (decimal,从绝对/相对推导) | "想跌到多少买?" |
| `amount` | ✅ | string (decimal,quote 单位) | "用多少钱买?" |
| `splitInto` | ❌ | integer 1-5 | (默认 1 整笔) |
| `expireAt` | ❌ | ISO date \| null | (可空表示永久挂单) |

## 风控前置

- ❌ `amount` > 用户总余额 30% → 拒绝并建议降额
- ❌ `triggerPrice` 偏离当前价 > 30% → 警告"价格离谱,确认这个价格?"(防误输入)
- ❌ `triggerPrice` ≥ 当前价 → 拒绝"这是抄底,不是追涨,触发价应该 < 当前价"
- ⚠️ `expireAt` 太远 (>180 天) → 提醒"半年后市场可能完全不一样,确认?"

## 输出

```json
{
  "strategyId": "h-v2-dip-buy-<uuid>",
  "type": "dip_buy",
  "watch": {
    "targetAsset": "BTC",
    "quoteAsset": "USDT",
    "currentPrice": "115000",
    "triggerPrice": "90000",
    "distanceToTrigger": "-21.7%",
    "expireAt": null
  },
  "executionWhenTriggered": {
    "amount": "5000",
    "estimatedTokenAmount": "0.0556 BTC",
    "splitInto": 1,
    "slippageBps": 50
  },
  "userConfirmRequired": true
}
```

## 详细流程 (Phase 3 实现时按此落地)

```
首次部署:
1. 用户确认门 → 入库 strategy + watch
2. 后端价格监听 worker 注册

监听 (cron 30s):
3. okx-dex-market price --token <targetAsset> --chain <chain>
4. 检查: 当前价 ≤ triggerPrice 吗?
   - 否 → 等下一轮
   - 是 → 进入执行

触发执行 (worker):
5. okx-agentic-wallet status / balance
6. okx-security token-scan (确认标的没新爆雷)
7. okx-dex-swap execute (一键流)
8. 写入卡库 + SSE 通知 '🎯 触发抄底 BTC @$89,800, 已买入 0.0557 BTC'
9. 标记 strategy = completed (单笔模式) 或继续监听下一批 (分批模式)
```

参考 [03 §5.3 Type 3](../../../../../docs/research/03-onchainos-deep-dive.md)。

## 错误处理

- `NEVER_TRIGGERED` (到期未触发) → 推送 SSE 通知用户决定续期/取消
- `TRIGGERED_BUT_INSUFFICIENT_BALANCE` → 暂停 + 推送提醒
- `TRIGGER_BUT_HIGH_SLIPPAGE` → 暂停 + 让用户决定执行/调整滑点
- `OKX_SESSION_EXPIRED` 同 dca

## 收益预期表述合规

抄底**不预测未来收益**。展示用"如果 X 价位触发,以当前价计可买 Y 个 Z"这种纯计算表述,**不写"预期反弹至 ABC,赚 DEF"**。
