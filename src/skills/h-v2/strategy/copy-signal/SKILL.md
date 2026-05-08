---
name: h.v2.strategy.copy_signal
description: "当用户表达跟着聪明钱/链上信号买入的意图时使用本技能,典型中文触发短语: '跟着聪明钱买', '跟单聪明钱', '那些大户在买啥我也跟', '聪明钱买啥我买啥', '帮我跟链上聪明钱', '跟单 KOL'(注意: KOL 在 H 内部统一映射到 OKX 链上聪明钱信号,不跟具名 KOL/网红 — 见 ADR-0010 §跟单合规口径)。本技能引导用户走完一个完整的跟单部署流程: 解析意图(信号源类型/跟单仓位上限/风险等级) → 缺字段时多轮追问(如'你能接受最多用多少钱跟单?') → 风险预审(总仓位上限是否合理 / 风险等级合理) → 推送'AI 思考可见'确认卡片(必须明确告知'我们只跟 OKX 链上聪明钱地址,不跟任何具名 KOL') → 用户确认后注册到后端信号监听 worker → worker 周期(默认 10 分钟)调 okx-dex-signal.list 拉聚合买信号 → 命中过滤 → 调 okx-security.token-scan 飞行前(防貔貅) → 调 okx-dex-swap.execute (单笔 ≤ 用户上限) → SSE 通知 '🟢 跟单聪明钱 0xabc...买入 PEPE'。不要用于: 1) 主动选币买入 (用 h.v2.strategy.dca / dip_buy), 2) 自动止盈卖出(本技能只跟买信号; 卖出用 take_profit 单独配), 3) 跟具名 KOL/网红/Twitter 大 V(本技能严禁,信号源仅限 OKX okx-dex-signal 的链上地址类型), 4) 跟单中心化交易所交易员(V1.5 H_V1 路线), 5) 跟单复杂多空对冲(V1.5+)。"
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
      - okx-dex-signal
      - okx-dex-token
      - okx-security
      - okx-dex-swap
      - okx-onchain-gateway
    impl: "./index.ts"
    schemas:
      input: "./input.schema.json"
      output: "./output.schema.json"
    mvpType: 5
---

# H_V2 跟单(信号驱动)策略 (`h.v2.strategy.copy_signal`)

> MVP 5 类策略 #5。详见 [ADR-0010](../../../../../docs/decisions/ADR-0010-mvp-scope-limited-to-5-strategy-types.md) §决策 + §跟单合规口径。

## 触发场景

用户表达"跟着聪明钱/大户/信号买"。**严格只跟 OKX `okx-dex-signal` 暴露的链上聪明钱聚合信号,不跟任何具名 KOL/网红/Twitter 账号**(per ADR-0010 跟单合规)。

## 输入参数

| 参数 | 必需 | 类型 | 缺时追问 |
|---|---|---|---|
| `signalSource` | ❌ | enum: `smart_money` (default) \| `whale` \| `kol_aggregated` | "跟哪种? 聪明钱 / 巨鲸 / KOL 聚合" |
| `maxPositionPerCopy` | ✅ | string (decimal,quote 单位) | "每次跟单最多用多少钱?" |
| `totalBudget` | ✅ | string (decimal) | "总共最多投多少跟单?" |
| `riskTier` | ❌ | "low" \| "medium" \| "high" (default: low) | "可接受多高风险?" |
| `quoteAsset` | ❌ | string (default USDT) | — |
| `chains` | ❌ | string[] | (默认主流链,白名单) |
| `expireAt` | ❌ | ISO date \| null | — |

## 风控前置

- ❌ `totalBudget` > 用户余额 30% → 拒绝并降额
- ❌ `maxPositionPerCopy` × 5 > `totalBudget` → 拒绝(防止单笔吃光预算)
- ❌ `riskTier=high` 配低风控阈值 → 强制二次确认
- ⚠️ 必须在确认卡片显眼提示: **"⚠️ 跟单不保证盈利,聪明钱也会亏损"**(合规)

## 输出

```json
{
  "strategyId": "h-v2-copy-signal-<uuid>",
  "type": "copy_signal",
  "config": {
    "signalSource": "smart_money",
    "maxPositionPerCopy": "200",
    "totalBudget": "1000",
    "riskTier": "low",
    "quoteAsset": "USDT",
    "expireAt": null
  },
  "constraints": {
    "tokenWhitelist": "OKX dapp-discovery 协议白名单内 + okx-security 通过",
    "antiHoneypot": "每笔跟单前强制 token-scan",
    "kolPolicy": "本策略不跟任何具名 KOL,信号源仅限链上聚合数据"
  },
  "userConfirmRequired": true,
  "complianceNotice": "⚠️ 跟单不保证盈利,链上聪明钱地址同样有亏损可能"
}
```

## 详细流程 (Phase 3 实现时按此落地)

```
首次部署:
1. 用户确认门 (必须显示合规提醒) → 入库 strategy

监听 (cron 10 min):
2. okx-dex-signal list --chain <chains>          # 拿当前买信号
3. 过滤:
   - 标的在白名单内 (okx-dapp-discovery 支持的协议 native token + 主流币)
   - 信号源类型 ∈ 用户配置的 signalSource
   - 信号 confidence ≥ 用户 riskTier 阈值
4. 对每个候选标的:
   a. okx-security token-scan <tokenAddress>   # 防貔貅
   b. okx-dex-token advanced-info <token>      # 检查 holder 集中度 / dev 信誉
   c. 通过 → 进入执行;否则 skip + 写日志
5. 检查累计已用 ≥ totalBudget? 是 → 暂停后续

执行:
6. okx-agentic-wallet balance (确认资金)
7. 计算本笔金额 = min(maxPositionPerCopy, totalBudget - used)
8. okx-dex-swap execute --from QUOTE --to <signalToken> --readable-amount X
9. 写入卡库 + SSE '🟢 跟单聪明钱 0xabc...买入 X (信号置信度 Y%, 本次用 $Z)'
10. 更新 used 累计
```

参考 [03 §5.3 Type 5](../../../../../docs/research/03-onchainos-deep-dive.md)。

## 错误处理

- `NO_SIGNAL_THIS_CYCLE` — 本周期无信号,不算错误
- `ALL_FILTERED` — 信号都被白名单/安全扫描刷掉,不算错误,推送 SSE 简短日志
- `BUDGET_EXHAUSTED` — 总预算用完,标记 completed + 通知用户
- `SIGNAL_API_QUOTA_EXHAUSTED` — `okx-dex-signal` x402 配额耗尽,后端按 `okx-x402-payment` 协议自动续费 (per [03 §3.4](../../../../../docs/research/03-onchainos-deep-dive.md))
- `OKX_SESSION_EXPIRED` 同 dca

## 收益预期表述合规

跟单**严格禁止任何盈利预期**,只展示:
- 信号源历史命中率(纯统计,非保证)
- 本次跟单的实时执行结果(数量 / 价格 / 累计已用)
- "⚠️ 链上聪明钱地址同样会亏损" 在每次卡片上提示

## 跟单合规口径(ADR-0010)

> 跟单类策略的合规口径只锁定 "OKX 链上信号不跟 KOL"。但跨地区监管细节未深究,V1.5 商业化阶段单独 ADR 处理。

意味着 V1.0 上线时,**任何"跟某具名 Twitter 大 V"的请求都要拒绝**:

```
用户: "跟着 [Twitter 网红 X] 买"
H:   "目前我只支持跟 OKX 链上聪明钱聚合信号,不跟任何具名账号 (合规要求)。
      你可以试试 '跟着聪明钱买',效果类似但没具名追星的合规风险。"
```
