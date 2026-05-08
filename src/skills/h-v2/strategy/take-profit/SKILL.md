---
name: h.v2.strategy.take_profit
description: "当用户表达'涨到某价格帮我卖'的条件触发止盈意图时使用本技能,典型中文触发短语: 'BTC 涨到 8 万帮我卖一半', 'ETH 到 5000 卖 30%', '帮我止盈 SOL', '比特币破 10 万全卖了', '涨 20% 卖一半', '我的 ETH 到 4500 全清仓'。本技能引导用户走完一个完整的条件止盈部署流程: 解析意图(持仓标的/触发价/卖出比例或绝对量) → 缺字段时多轮追问 → 调 okx-wallet-portfolio 检查实际持仓量 → 风险预审(卖出量是否合理 / 是否会清仓) → 推送'AI 思考可见'确认卡片 → 用户确认后注册到后端价格监听 worker → worker 周期调 okx-dex-market.price → 触发后调 okx-dex-swap.execute (target → quote) → SSE 实时通知。不要用于: 1) 立即一次性卖出(不带触发价 → 走单次 swap), 2) 条件买入 (用 h.v2.strategy.dip_buy), 3) 周期减仓(V1.5 路线), 4) 多级阶梯止盈如'5万卖30%, 6万再卖30%'(MVP 不支持单意图组合,需用户分两次说), 5) 跟踪止损(V1.5 路线), 6) 永续合约平仓(V1.5 H_V1 路线), 7) 5 类之外的复杂条件(必须坦白拒绝并建议简化)。"
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
    impl: "./index.ts"
    schemas:
      input: "./input.schema.json"
      output: "./output.schema.json"
    mvpType: 4
---

# H_V2 条件止盈策略 (`h.v2.strategy.take_profit`)

> MVP 5 类策略 #4。详见 [ADR-0010](../../../../../docs/decisions/ADR-0010-mvp-scope-limited-to-5-strategy-types.md) §决策。

## 触发场景

用户用一句中文描述"价格到 X 时帮我卖 [比例 / 全部] 持仓"。

支持触发模式:
- **绝对价**: "BTC 涨到 80000 卖一半"
- **相对涨幅**: "再涨 20% 卖一半" (内部转换为绝对价 = 当前价 × 1.2)

## 输入参数

| 参数 | 必需 | 类型 | 缺时追问 |
|---|---|---|---|
| `holdingAsset` | ✅ | string | "卖什么?(列出当前持仓让用户选)" |
| `quoteAsset` | ❌ | string (default USDT) | — |
| `triggerPrice` | ✅ | string (decimal) | "涨到多少卖?" |
| `sellRatio` | ✅ | string (0..1) 或 enum: "half" \| "all" | "卖多少比例? 一半 / 全部 / 自定义?" |
| `expireAt` | ❌ | ISO date \| null | (可空) |

## 风控前置

- ❌ `triggerPrice` ≤ 当前价 → 拒绝"这是止盈,触发价应该 > 当前价"
- ❌ `triggerPrice` 偏离当前价 > 200% → 警告"价格离谱,确认?"
- ❌ 用户根本没该 `holdingAsset` 的持仓 → 拒绝并解释
- ⚠️ `sellRatio = 1` (清仓) → 强制二次确认门,显眼标黄
- ⚠️ `triggerPrice` 超过历史最高 → 提醒"这超过了历史最高,确认?"

## 输出

```json
{
  "strategyId": "h-v2-take-profit-<uuid>",
  "type": "take_profit",
  "watch": {
    "holdingAsset": "BTC",
    "currentPrice": "115000",
    "triggerPrice": "150000",
    "distanceToTrigger": "+30.4%",
    "currentHolding": "0.5 BTC"
  },
  "executionWhenTriggered": {
    "sellRatio": 0.5,
    "estimatedSellAmount": "0.25 BTC",
    "estimatedReceiveAmount": "37500 USDT (按当前价估)",
    "slippageBps": 50
  },
  "userConfirmRequired": true,
  "extraConfirmIfRatioOne": false
}
```

## 详细流程 (Phase 3 实现时按此落地)

```
首次部署:
1. okx-wallet-portfolio (确认确实持有 holdingAsset)
2. 用户确认门 → 入库 strategy + watch

监听 (cron 30s):
3. okx-dex-market price --token <holdingAsset>
4. 当前价 ≥ triggerPrice 吗?
   - 否 → 等下一轮
   - 是 → 进入执行

触发执行:
5. okx-agentic-wallet balance --token <holdingAsset>  # 重新拉持仓 (持仓可能已变)
6. 计算 sellAmount = holding × sellRatio
7. okx-dex-swap execute --from <holdingAsset> --to <quote> --readable-amount <sellAmount>
8. 写入卡库 + SSE '💰 BTC @$150,200 触发止盈, 已卖 0.25 BTC, 兑得 $37,550'
9. 标记 strategy = completed
```

参考 [03 §5.3 Type 4](../../../../../docs/research/03-onchainos-deep-dive.md)。

## 错误处理

- `HOLDING_REDUCED` (用户期间手动减仓导致触发时持仓不足) → 按实际剩余按比例卖,推送 SSE 解释
- `TRIGGER_BUT_HIGH_SLIPPAGE` → 暂停 + 让用户决定
- `OKX_SESSION_EXPIRED` 同 dca

## 收益预期表述合规

止盈不展示"赚了多少"作为预期(因为成本基础视用户而异)。触发后实际成交时才在卡片上显示"本次卖出实现盈利 +$X (vs 你的平均成本)"。
