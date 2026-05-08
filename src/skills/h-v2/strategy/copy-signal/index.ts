// h.v2.strategy.copy_signal · MVP Mock 实现
// 真实流程见同目录 SKILL.md.
//
// 严格合规约束 (per ADR-0010 跟单合规口径):
//   只跟 OKX 链上聚合信号 (`okx-dex-signal` / `okx-dex-trenches`),
//   不跟任何具名 KOL/网红/Twitter 账号.

import type { SkillCtx, SkillImpl, SkillResult } from "../../../types";

interface CopySignalInput {
  signalSource?: "smart_money" | "whale" | "kol_aggregated";
  maxPositionPerCopy?: string;
  totalBudget?: string;
  riskTier?: "low" | "medium" | "high";
  quoteAsset?: string;
  chains?: string[];
  expireAt?: string | null;
}

export const copySignal: SkillImpl = async (
  rawInput: unknown,
  ctx: SkillCtx,
): Promise<SkillResult> => {
  const input = (rawInput ?? {}) as CopySignalInput;

  const signalSource = input.signalSource ?? "smart_money";
  const maxPositionPerCopy = input.maxPositionPerCopy ?? "200";
  const totalBudget = input.totalBudget ?? "1000";
  const riskTier = input.riskTier ?? "low";
  const quoteAsset = input.quoteAsset ?? "USDT";

  ctx.log.info("copy_signal.start", { signalSource, maxPositionPerCopy, totalBudget, riskTier });

  // 防止 maxPositionPerCopy × 5 吃光预算
  if (Number(maxPositionPerCopy) * 5 > Number(totalBudget)) {
    return {
      code: "RISK_REJECTED",
      reason: `单笔上限 (${maxPositionPerCopy}) × 5 > 总预算 (${totalBudget}). 调小单笔或加大预算.`,
    };
  }

  const riskCheck = await ctx.risk.preCompileCheck({
    type: "copy_signal",
    signalSource,
    maxPositionPerCopy,
    totalBudget,
    riskTier,
  });
  if (!riskCheck.ok) {
    return { code: "RISK_REJECTED", reason: riskCheck.reason ?? "risk_caps_exceeded" };
  }

  await ctx.ui.showCard("strategy.copy_signal.preview", {
    signalSource,
    maxPositionPerCopy,
    totalBudget,
    riskTier,
    quoteAsset,
    constraints: {
      tokenWhitelist: "OKX dapp-discovery 协议白名单 + okx-security 通过",
      antiHoneypot: "每笔跟单前强制 token-scan",
      kolPolicy: "本策略不跟任何具名 KOL,信号源仅限链上聚合数据",
    },
    complianceNotice: "⚠️ 跟单不保证盈利,链上聪明钱地址同样有亏损可能",
  });

  const confirmed = await ctx.ui.awaitConfirm(60_000);
  if (!confirmed) {
    return { code: "USER_CANCELED", reason: "user_declined_at_confirm_card" };
  }

  const strategyId = `h-v2-copy-signal-${Date.now().toString(36)}`;
  ctx.ui.pushEvent("strategy.copy_signal.armed", {
    strategyId,
    msg: `👥 跟单已启动: 信号源 ${signalSource}, 单笔 ≤ ${maxPositionPerCopy} ${quoteAsset}, 总预算 ${totalBudget}`,
  });

  return {
    code: "OK",
    data: {
      strategyId,
      type: "copy_signal",
      config: {
        signalSource,
        maxPositionPerCopy,
        totalBudget,
        riskTier,
        quoteAsset,
      },
    },
  };
};
