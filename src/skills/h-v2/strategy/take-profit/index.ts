// h.v2.strategy.take_profit · MVP Mock 实现
// 真实流程见同目录 SKILL.md.

import type { SkillCtx, SkillImpl, SkillResult } from "../../../types";

interface TakeProfitInput {
  holdingAsset?: string;
  quoteAsset?: string;
  triggerPrice?: string;
  sellRatio?: string | "half" | "all";
  expireAt?: string | null;
}

const MOCK_CURRENT_PRICE: Record<string, number> = {
  BTC: 115_000,
  ETH: 3_500,
  SOL: 150,
};

const MOCK_HOLDING: Record<string, string> = {
  BTC: "0.5",
  ETH: "5",
  SOL: "100",
};

function parseSellRatio(input: TakeProfitInput["sellRatio"]): number {
  if (input === "half") return 0.5;
  if (input === "all") return 1;
  if (input === undefined) return 0.5;
  const n = Number(input);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.5;
}

export const takeProfit: SkillImpl = async (
  rawInput: unknown,
  ctx: SkillCtx,
): Promise<SkillResult> => {
  const input = (rawInput ?? {}) as TakeProfitInput;

  const holdingAsset = input.holdingAsset ?? "BTC";
  const quoteAsset = input.quoteAsset ?? "USDT";
  const triggerPrice = input.triggerPrice ?? "150000";
  const sellRatio = parseSellRatio(input.sellRatio);

  ctx.log.info("take_profit.start", { holdingAsset, triggerPrice, sellRatio });

  const currentPrice = MOCK_CURRENT_PRICE[holdingAsset] ?? 1000;
  const currentHolding = MOCK_HOLDING[holdingAsset] ?? "0";

  if (Number(currentHolding) <= 0) {
    return {
      code: "RISK_REJECTED",
      reason: `你目前没有 ${holdingAsset} 持仓, 无法设置止盈策略.`,
    };
  }

  if (Number(triggerPrice) <= currentPrice) {
    return {
      code: "RISK_REJECTED",
      reason: `take_profit 的触发价 (${triggerPrice}) 必须 > 当前价 (${currentPrice}). 想减仓? 用其他策略.`,
    };
  }

  const riskCheck = await ctx.risk.preCompileCheck({
    type: "take_profit",
    holdingAsset,
    triggerPrice,
    sellRatio,
    currentPrice,
    currentHolding,
  });
  if (!riskCheck.ok) {
    return { code: "RISK_REJECTED", reason: riskCheck.reason ?? "risk_caps_exceeded" };
  }

  const sellAmount = (Number(currentHolding) * sellRatio).toFixed(6);
  const estimatedReceive = (Number(sellAmount) * Number(triggerPrice)).toFixed(2);
  const distancePct = (((Number(triggerPrice) - currentPrice) / currentPrice) * 100).toFixed(1);

  await ctx.ui.showCard("strategy.take_profit.preview", {
    holdingAsset,
    currentPrice,
    triggerPrice,
    distancePct: `+${distancePct}%`,
    currentHolding,
    sellRatio,
    sellAmount,
    estimatedReceive,
    quoteAsset,
    extraConfirmIfRatioOne: sellRatio === 1,
    note:
      sellRatio === 1
        ? `⚠️ 全部清仓 ${holdingAsset} (${currentHolding} 个), 触发价 ${triggerPrice}`
        : `卖出 ${(sellRatio * 100).toFixed(0)}% 持仓 (${sellAmount} ${holdingAsset}) 在 ${triggerPrice}`,
  });

  const confirmed = await ctx.ui.awaitConfirm(60_000);
  if (!confirmed) {
    return { code: "USER_CANCELED", reason: "user_declined_at_confirm_card" };
  }

  const strategyId = `h-v2-take-profit-${Date.now().toString(36)}`;
  ctx.ui.pushEvent("strategy.take_profit.armed", {
    strategyId,
    msg: `💰 已挂单监听: ${holdingAsset} ≥ $${triggerPrice} 触发卖出 ${sellAmount} ${holdingAsset}`,
  });

  return {
    code: "OK",
    data: {
      strategyId,
      type: "take_profit",
      watch: { holdingAsset, currentPrice, triggerPrice, distancePct, currentHolding },
      executionWhenTriggered: { sellRatio, sellAmount, estimatedReceive, quoteAsset },
    },
  };
};
