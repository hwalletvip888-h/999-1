// h.v2.strategy.stable_yield · MVP Mock 实现
//
// 真实流程见同目录 SKILL.md "详细流程" 章节. 本文件是 v0.1 Mock,
// 不调真实 OKX skill, 模拟出"挑了 3 个池分散 + 用户确认 + 部署"的全流程.
// Phase 3 后续 commit 把 mock 替换为真实 onchainos CLI 子进程编排.

import type { SkillCtx, SkillImpl, SkillResult } from "../../../types";

interface StableYieldInput {
  amount?: string;
  asset?: "USDC" | "USDT" | "DAI";
  term?: string | number;
  chain?: string;
  maxVolatility?: "low" | "medium" | "high";
  splitInto?: number;
}

const MOCK_POOLS = [
  { investmentId: "mock-aave-v3-usdc", platform: "Aave V3", apy: "5.2%", chain: "ethereum" },
  { investmentId: "mock-compound-usdc", platform: "Compound V3", apy: "4.8%", chain: "ethereum" },
  { investmentId: "mock-spark-usdc", platform: "Spark", apy: "5.5%", chain: "ethereum" },
];

export const stableYield: SkillImpl = async (
  rawInput: unknown,
  ctx: SkillCtx,
): Promise<SkillResult> => {
  const input = (rawInput ?? {}) as StableYieldInput;

  // 缺字段 → 后端不在这里追问 (那是对话编排层 ② 的事), 按 Mock 默认填充演示
  const amount = input.amount ?? "5000";
  const asset = input.asset ?? "USDC";
  const term = input.term ?? "随时取";
  const splitInto = input.splitInto ?? 3;

  ctx.log.info("stable_yield.start", { amount, asset, term, splitInto });

  // 1. 风控前置 (per ADR-0009 挑战 1)
  const riskCheck = await ctx.risk.preCompileCheck({
    type: "stable_yield",
    amount,
    asset,
    term,
  });
  if (!riskCheck.ok) {
    return { code: "RISK_REJECTED", reason: riskCheck.reason ?? "risk_caps_exceeded" };
  }

  // 2. Mock: 挑 top splitInto 个池
  const pools = MOCK_POOLS.slice(0, splitInto);
  const allocation = (Number(amount) / pools.length).toFixed(2);

  // 3. 推卡片等用户确认
  await ctx.ui.showCard("strategy.stable_yield.preview", {
    amount,
    asset,
    term,
    pools: pools.map((p) => ({ ...p, allocation })),
    expectedApyRange: ["3.1%", "6.2%"],
    historicalNote: "过去 12 个月平均 5.2%, 最低 3.1%, 极端情况下短期可能为负",
  });

  const confirmed = await ctx.ui.awaitConfirm(60_000);
  if (!confirmed) {
    return { code: "USER_CANCELED", reason: "user_declined_at_confirm_card" };
  }

  // 4. Mock: 模拟部署 (真实代码会循环调 okx-defi-invest deposit + onchain-gateway broadcast)
  const strategyId = `h-v2-stable-yield-${Date.now().toString(36)}`;
  for (let i = 0; i < pools.length; i++) {
    ctx.ui.pushEvent("strategy.deploy_step", {
      strategyId,
      step: i + 1,
      total: pools.length,
      pool: pools[i],
      allocation,
      msg: `已部署到 ${pools[i].platform} ($${allocation} ${asset})`,
    });
    // Mock 延时模拟链上确认
    await delay(50);
  }

  ctx.ui.pushEvent("strategy.deployed", {
    strategyId,
    msg: `🟢 策略已启动, 预期月化 5.2% (历史区间 3.1%-6.2%)`,
  });

  return {
    code: "OK",
    data: {
      strategyId,
      type: "stable_yield",
      pools: pools.map((p) => ({ ...p, allocation })),
      expectedApyRange: ["3.1%", "6.2%"],
    },
  };
};

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
