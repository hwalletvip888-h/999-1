// h.v2.strategy.dip_buy · MVP Mock 实现
// 真实流程见同目录 SKILL.md.

import type { SkillCtx, SkillImpl, SkillResult } from "../../../types";

interface DipBuyInput {
  targetAsset?: string;
  quoteAsset?: string;
  triggerPrice?: string;
  amount?: string;
  splitInto?: number;
  expireAt?: string | null;
}

const MOCK_CURRENT_PRICE: Record<string, number> = {
  BTC: 115_000,
  ETH: 3_500,
  SOL: 150,
};

export const dipBuy: SkillImpl = async (
  rawInput: unknown,
  ctx: SkillCtx,
): Promise<SkillResult> => {
  const input = (rawInput ?? {}) as DipBuyInput;

  const targetAsset = input.targetAsset ?? "BTC";
  const quoteAsset = input.quoteAsset ?? "USDT";
  const triggerPrice = input.triggerPrice ?? "90000";
  const amount = input.amount ?? "5000";
  const splitInto = input.splitInto ?? 1;

  ctx.log.info("dip_buy.start", { targetAsset, triggerPrice, amount });

  const currentPrice = MOCK_CURRENT_PRICE[targetAsset] ?? 1000;

  // 触发价应该 < 当前价 (per SKILL.md 风控)
  if (Number(triggerPrice) >= currentPrice) {
    return {
      code: "RISK_REJECTED",
      reason: `dip_buy 的触发价 (${triggerPrice}) 必须 < 当前价 (${currentPrice}). 想追涨? 用其他策略.`,
    };
  }

  const riskCheck = await ctx.risk.preCompileCheck({
    type: "dip_buy",
    targetAsset,
    triggerPrice,
    amount,
    currentPrice,
  });
  if (!riskCheck.ok) {
    return { code: "RISK_REJECTED", reason: riskCheck.reason ?? "risk_caps_exceeded" };
  }

  const distancePct = (((Number(triggerPrice) - currentPrice) / currentPrice) * 100).toFixed(1);
  const estimatedTokenAmount = (Number(amount) / Number(triggerPrice)).toFixed(6);

  await ctx.ui.showCard("strategy.dip_buy.preview", {
    targetAsset,
    quoteAsset,
    currentPrice,
    triggerPrice,
    distancePct,
    amount,
    estimatedTokenAmount,
    splitInto,
    note: `挂单等待 ${targetAsset} 跌到 ${triggerPrice}, 触发后用 ${amount} ${quoteAsset} 买入约 ${estimatedTokenAmount} ${targetAsset}`,
  });

  const confirmed = await ctx.ui.awaitConfirm(60_000);
  if (!confirmed) {
    return { code: "USER_CANCELED", reason: "user_declined_at_confirm_card" };
  }

  const strategyId = `h-v2-dip-buy-${Date.now().toString(36)}`;
  ctx.ui.pushEvent("strategy.dip_buy.armed", {
    strategyId,
    msg: `🎯 已挂单监听: ${targetAsset} ≤ $${triggerPrice} 触发买入 ${amount} ${quoteAsset}`,
  });

  return {
    code: "OK",
    data: {
      strategyId,
      type: "dip_buy",
      watch: { targetAsset, quoteAsset, currentPrice, triggerPrice, distancePct },
      executionWhenTriggered: { amount, estimatedTokenAmount, splitInto },
    },
  };
};
