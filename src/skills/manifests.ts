// H Skill manifests - V1.0 MVP (per ADR-0010 5 类范围)
//
// 本文件**手写维护** v0.1 阶段; Phase 3 后期可以替换为构建脚本从
// `src/skills/h-v2/**/SKILL.md` frontmatter 自动生成 (`manifests.generated.ts`).
// 现阶段手写 5 份就够, 不引入额外构建工具.
//
// 每个 manifest 必须跟对应 SKILL.md 的 frontmatter 一一对应.

import type { SkillManifest } from "./types";

// ─── 5 类 MVP 策略 (全部 H_V2, per ADR-0010) ─────────────────────────────────

const stableYield: SkillManifest = {
  name: "h.v2.strategy.stable_yield",
  description:
    "当用户表达想用稳定币赚取稳定/被动收益时使用本技能, 典型中文触发短语: '帮我赚稳定收益', '我想存 USDC 吃利息', '帮我用稳定币理财', '把闲钱放在能赚钱的地方', '5000 U 放 3 个月赚点利息'。本技能引导用户走完: 解析意图(金额/期限/最大波动/链偏好) → 缺字段时多轮自然语言追问 → 调 okx-defi-invest search 找当前白名单内 top APY 的稳定币池 → 调 okx-security token-scan 飞行前安全扫描 → 估算预期收益区间(必带历史最低/最高/极端情况修饰) → 推送'AI 思考可见'确认卡片 → 用户确认后调 okx-defi-invest deposit 部署到 1-3 个池分散 → onchain-gateway 广播 → 写卡库 + SSE 通知 UI → 注册到后端策略引擎做后续监控/复盘。不要用于: 单次代币兑换 (用 h.v2.strategy.dca), 条件触发买入 (用 h.v2.strategy.dip_buy), 卖出 (用 h.v2.strategy.take_profit), 跟单 (用 h.v2.strategy.copy_signal), 5 类之外的策略 (必须坦白拒绝并建议替代方案)。",
  license: "Apache-2.0",
  metadata: {
    author: "h-wallet",
    version: "0.1.0",
    homepage: "https://github.com/hwalletvip888-h/999-1",
    agent: {
      backed_by: [
        "okx-agentic-wallet",
        "okx-wallet-portfolio",
        "okx-defi-invest",
        "okx-security",
        "okx-onchain-gateway",
      ],
      impl: "./h-v2/strategy/stable-yield/index",
      mvpType: 1,
    },
  },
};

const dca: SkillManifest = {
  name: "h.v2.strategy.dca",
  description:
    "当用户表达定时定额买入 (DCA, Dollar-Cost Averaging) 意图时使用本技能, 典型中文触发短语: '每周存 1000 块买 BTC', '每天买 100 USDT 的 ETH', '帮我定投 SOL', '每个月 1 号买点比特币', '我想做定投'。本技能引导用户走完: 解析意图(单期金额/周期/标的/总预算或时长) → 缺字段时多轮追问 → 风险预审 → 推送'AI 思考可见'确认卡片 → 用户确认后注册到后端定时调度器 → 每个周期触发 worker 调 okx-dex-swap.execute (一键流: quote→approve→swap→sign→broadcast) → SSE 实时通知 UI '✅ 已买入 X 个 Y'。不要用于: 一次性买入(单次 swap), 条件触发买 (用 dip_buy), 卖出 (用 take_profit), 跟单 (用 copy_signal), 稳定币理财 (用 stable_yield), 5 类外策略如网格/合约定投/期权 DCA(必须坦白拒绝, 建议替代方案: 网格→V1.5 路线; 合约定投→V1.5 路线)。",
  license: "Apache-2.0",
  metadata: {
    author: "h-wallet",
    version: "0.1.0",
    homepage: "https://github.com/hwalletvip888-h/999-1",
    agent: {
      backed_by: [
        "okx-agentic-wallet",
        "okx-wallet-portfolio",
        "okx-dex-swap",
        "okx-onchain-gateway",
        "okx-security",
      ],
      impl: "./h-v2/strategy/dca/index",
      mvpType: 2,
    },
  },
};

const dipBuy: SkillManifest = {
  name: "h.v2.strategy.dip_buy",
  description:
    "当用户表达'跌到某价格帮我买'的条件触发抄底意图时使用本技能, 典型中文触发短语: '跌到 5 万帮我买 BTC', 'BTC 跌到 90000 我要进 5000 U', '以太到 3000 帮我抄底 1 万 U', '帮我抄底 SOL', '下跌 10% 帮我买'(此种相对触发也接受), '比特币跌破 8 万买入'。本技能引导用户走完: 解析意图(标的/触发价或触发条件/单次金额/是否分批) → 缺字段时追问 → 风险预审(总投入是否合理 / 触发价是否离谱 / 是否在余额范围内) → 推送'AI 思考可见'确认卡片 → 用户确认后注册到后端价格监听 worker → worker 周期(默认 30s)调 okx-dex-market.price 检查 → 触发后调 okx-dex-swap.execute → SSE 实时通知用户。不要用于: 立即一次性买入(不带触发价 → 单次 swap), 周期定投 (用 dca), 卖出/止盈 (用 take_profit), 跟单 (用 copy_signal), 稳定币理财 (用 stable_yield), 5 类外的复杂条件如'跌破 EMA20 后 RSI<30 才买'(必须坦白拒绝: 复杂指标条件需要 V1.5/V2.0)。",
  license: "Apache-2.0",
  metadata: {
    author: "h-wallet",
    version: "0.1.0",
    homepage: "https://github.com/hwalletvip888-h/999-1",
    agent: {
      backed_by: [
        "okx-agentic-wallet",
        "okx-wallet-portfolio",
        "okx-dex-market",
        "okx-dex-swap",
        "okx-onchain-gateway",
        "okx-security",
      ],
      impl: "./h-v2/strategy/dip-buy/index",
      mvpType: 3,
    },
  },
};

const takeProfit: SkillManifest = {
  name: "h.v2.strategy.take_profit",
  description:
    "当用户表达'涨到某价格帮我卖'的条件触发止盈意图时使用本技能, 典型中文触发短语: 'BTC 涨到 8 万帮我卖一半', 'ETH 到 5000 卖 30%', '帮我止盈 SOL', '比特币破 10 万全卖了', '涨 20% 卖一半', '我的 ETH 到 4500 全清仓'。本技能引导用户走完: 解析意图(持仓标的/触发价/卖出比例) → 缺字段时追问 → 调 okx-wallet-portfolio 检查实际持仓量 → 风险预审 → 推送'AI 思考可见'确认卡片 → 用户确认后注册到后端价格监听 worker → worker 周期调 okx-dex-market.price → 触发后调 okx-dex-swap.execute (target → quote) → SSE 实时通知。不要用于: 立即一次性卖出(单次 swap), 条件买入 (用 dip_buy), 周期减仓(V1.5 路线), 多级阶梯止盈如'5万卖30%, 6万再卖30%'(MVP 不支持单意图组合, 需用户分两次说), 跟踪止损(V1.5 路线), 永续合约平仓(V1.5 H_V1 路线), 5 类外的复杂条件(必须坦白拒绝并建议简化)。",
  license: "Apache-2.0",
  metadata: {
    author: "h-wallet",
    version: "0.1.0",
    homepage: "https://github.com/hwalletvip888-h/999-1",
    agent: {
      backed_by: [
        "okx-agentic-wallet",
        "okx-wallet-portfolio",
        "okx-dex-market",
        "okx-dex-swap",
        "okx-onchain-gateway",
      ],
      impl: "./h-v2/strategy/take-profit/index",
      mvpType: 4,
    },
  },
};

const copySignal: SkillManifest = {
  name: "h.v2.strategy.copy_signal",
  description:
    "当用户表达跟着聪明钱/链上信号买入的意图时使用本技能, 典型中文触发短语: '跟着聪明钱买', '跟单聪明钱', '那些大户在买啥我也跟', '聪明钱买啥我买啥', '帮我跟链上聪明钱', '跟单 KOL'(注意: KOL 在 H 内部统一映射到 OKX 链上聪明钱信号, 不跟具名 KOL/网红 — per ADR-0010 跟单合规口径)。本技能引导用户走完: 解析意图(信号源类型/跟单仓位上限/风险等级) → 缺字段时追问 → 风险预审 → 推送'AI 思考可见'确认卡片(必须明确告知'我们只跟 OKX 链上聪明钱地址, 不跟任何具名 KOL') → 用户确认后注册到后端信号监听 worker → worker 周期(默认 10 分钟)调 okx-dex-signal.list 拉聚合买信号 → 命中过滤 → 调 okx-security.token-scan 飞行前(防貔貅) → 调 okx-dex-swap.execute (单笔 ≤ 用户上限) → SSE 通知。不要用于: 主动选币买入 (用 dca / dip_buy), 自动止盈卖出(本技能只跟买信号; 卖出用 take_profit 单独配), 跟具名 KOL/网红/Twitter 大 V(本技能严禁, 信号源仅限 OKX okx-dex-signal 的链上地址类型), 跟单中心化交易所交易员(V1.5 H_V1 路线), 跟单复杂多空对冲(V1.5+)。",
  license: "Apache-2.0",
  metadata: {
    author: "h-wallet",
    version: "0.1.0",
    homepage: "https://github.com/hwalletvip888-h/999-1",
    agent: {
      backed_by: [
        "okx-agentic-wallet",
        "okx-wallet-portfolio",
        "okx-dex-signal",
        "okx-dex-token",
        "okx-security",
        "okx-dex-swap",
        "okx-onchain-gateway",
      ],
      impl: "./h-v2/strategy/copy-signal/index",
      mvpType: 5,
    },
  },
};

/** 全部 5 类 MVP H Skill manifests, 启动时由 registry 加载. */
export const ALL_H_SKILL_MANIFESTS: SkillManifest[] = [
  stableYield,
  dca,
  dipBuy,
  takeProfit,
  copySignal,
];
