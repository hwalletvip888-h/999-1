// h.v2.strategy.dca · MVP Mock 实现
// 真实流程见同目录 SKILL.md.

import type { SkillCtx, SkillImpl, SkillResult } from "../../../types";

interface DcaInput {
  targetAsset?: string;
  quoteAsset?: string;
  amountPerPeriod?: string;
  period?: "daily" | "weekly" | "biweekly" | "monthly";
  totalBudget?: string | null;
  endDate?: string | null;
  chain?: string;
  slippageBps?: number;
}

const PERIOD_MS: Record<NonNullable<DcaInput["period"]>, number> = {
  daily: 24 * 3600 * 1000,
  weekly: 7 * 24 * 3600 * 1000,
  biweekly: 14 * 24 * 3600 * 1000,
  monthly: 30 * 24 * 3600 * 1000,
};

export const dca: SkillImpl = async (rawInput: unknown, ctx: SkillCtx): Promise<SkillResult> => {
  const input = (rawInput ?? {}) as DcaInput;

  const targetAsset = input.targetAsset ?? "BTC";
  const quoteAsset = input.quoteAsset ?? "USDT";
  const amountPerPeriod = input.amountPerPeriod ?? "100";
  const period = input.period ?? "weekly";
  const totalBudget = input.totalBudget ?? null;

  ctx.log.info("dca.start", { targetAsset, amountPerPeriod, period });

  const riskCheck = await ctx.risk.preCompileCheck({
    type: "dca",
    targetAsset,
    quoteAsset,
    amountPerPeriod,
    period,
    totalBudget,
  });
  if (!riskCheck.ok) {
    return { code: "RISK_REJECTED", reason: riskCheck.reason ?? "risk_caps_exceeded" };
  }

  const nextRunAt = Date.now() + PERIOD_MS[period];
  const estimatedRunsLeft =
    totalBudget !== null && totalBudget !== undefined
      ? Math.floor(Number(totalBudget) / Number(amountPerPeriod))
      : null;

  await ctx.ui.showCard("strategy.dca.preview", {
    targetAsset,
    quoteAsset,
    amountPerPeriod,
    period,
    totalBudget,
    estimatedRunsLeft,
    nextRunAt,
    note: "每个周期 H 自动调用 OKX DEX 聚合器一键兑换 (报价→授权→swap→签名→广播)",
  });

  const confirmed = await ctx.ui.awaitConfirm(60_000);
  if (!confirmed) {
    return { code: "USER_CANCELED", reason: "user_declined_at_confirm_card" };
  }

  const strategyId = `h-v2-dca-${Date.now().toString(36)}`;
  ctx.ui.pushEvent("strategy.dca.scheduled", {
    strategyId,
    msg: `📅 已注册 ${period} DCA: 每期 ${amountPerPeriod} ${quoteAsset} → ${targetAsset}`,
  });

  return {
    code: "OK",
    data: {
      strategyId,
      type: "dca",
      schedule: {
        period,
        nextRunAt,
        amountPerPeriod,
        quoteAsset,
        targetAsset,
        estimatedRunsLeft,
      },
    },
  };
};
