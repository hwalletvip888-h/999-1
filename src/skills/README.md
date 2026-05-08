# H Skills

H Wallet 的业务流程编排技能,跟随 [Anthropic Agent Skills](https://agentskills.io) 标准格式 (跟 OKX OnchainOS Skills 同构)。

## 命名规范 (per [ADR-0005](../../docs/decisions/ADR-0005-h-skill-naming-convention.md))

```
h.<v1|v2>.<domain>.<action>
```

- `v1` = H_V1 (中心化交易所策略,V1.5+ 路线)
- `v2` = H_V2 (链上 DEX 策略,V1.0 MVP 范围)
- `<domain>` snake_case · `<action>` snake_case

## V1.0 MVP 范围 (per [ADR-0010](../../docs/decisions/ADR-0010-mvp-scope-limited-to-5-strategy-types.md))

5 类策略,全部走 H_V2 (链上 DEX,主流币种 USDC/USDT/BTC/ETH/SOL/OKB):

| # | 类型 | Skill | 状态 |
|---|---|---|---|
| 1 | 稳定收益 | [`h.v2.strategy.stable_yield`](./h-v2/strategy/stable-yield/) | SKILL.md ✅ · impl ⏳ |
| 2 | 定投 (DCA) | [`h.v2.strategy.dca`](./h-v2/strategy/dca/) | SKILL.md ✅ · impl ⏳ |
| 3 | 条件抄底 | [`h.v2.strategy.dip_buy`](./h-v2/strategy/dip-buy/) | SKILL.md ✅ · impl ⏳ |
| 4 | 条件止盈 | [`h.v2.strategy.take_profit`](./h-v2/strategy/take-profit/) | SKILL.md ✅ · impl ⏳ |
| 5 | 跟单(信号驱动) | [`h.v2.strategy.copy_signal`](./h-v2/strategy/copy-signal/) | SKILL.md ✅ · impl ⏳ |

## 5 类外的请求

LLM **必须强制接地**到这 5 类。任何 5 类外的请求(网格 / 套利 / LP / 马丁格尔 / 三角套利 / 自由编排 / ...)按 [ADR-0009 §挑战 3](../../docs/decisions/ADR-0009-natural-language-strategy-compiler.md) 优雅拒绝并给替代方案,同时标注路线图(V1.5 / V2.0)。

## 目录结构

```
src/skills/
├── README.md                                  ← 本文
├── registry.ts                                (待 commit 6 写: Skill 注册 + LLM tools[] 转换 + 路由)
├── types.ts                                   (待 commit 6 写: SkillEntry / SkillImpl / SkillCtx)
└── h-v2/
    └── strategy/
        ├── stable-yield/
        │   ├── SKILL.md                       ← LLM 路由 + 完整流程文档
        │   ├── input.schema.json              (待 Phase 3 后续 commit)
        │   ├── output.schema.json             (待)
        │   └── index.ts                       (待)
        ├── dca/                               同上
        ├── dip-buy/                           同上
        ├── take-profit/                       同上
        └── copy-signal/                       同上
```

## SKILL.md 格式

跟 OKX OnchainOS / Anthropic Agent Skills 完全同构:

```yaml
---
name: h.v2.strategy.<type>
description: "中文意图触发短语 + 完整流程概述 + 'Do NOT use for' 反向边界"
license: Apache-2.0
metadata:
  author: h-wallet
  version: "0.x.y"
  agent:
    requires:
      hSkills: []                               (可选: 依赖的其他 H 技能)
    backed_by:                                  (我们扩展字段: 列出底下用的 OKX skill)
      - okx-defi-invest
      - okx-security
      ...
    impl: "./index.ts"
    schemas:
      input: "./input.schema.json"
      output: "./output.schema.json"
    mvpType: <1-5>                              (我们扩展字段: ADR-0010 5 类编号)
---

# 技能正文 (给开发者读, LLM 不会塞这部分进 prompt)

## 触发场景 / 输入参数 / 风控前置 / 输出 / 详细流程 / 错误处理 / 合规
```

## 编排底下的 OKX skill

5 类技能内部都会调用 `.agents/skills/` 里装的 OKX 17 个 skill (per [03 §5.3](../../docs/research/03-onchainos-deep-dive.md))。具体编排映射见各 SKILL.md 的"详细流程"章节。

> ⚠️ `.agents/` 目录通过 `.gitignore` 排除,本地装 (`npx skills add okx/onchainos-skills --all`) 才会出现。
