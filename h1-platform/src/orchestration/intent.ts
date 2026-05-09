import { h1ErrorCode } from "../types/h1-errors.js";

/** 用户侧上下文（绑定地址等），由会话/BFF 注入 */
export interface UserProfileContext {
  userId: string;
  /** 用户绑定的 OKX 收款地址（示例） */
  boundOkxAddress?: string;
}

export type TransferStableIntent = {
  kind: "transfer_stable";
  amountUsd: number;
  destination: "bound_okx";
};

export type ClarifyIntent = {
  kind: "clarify";
  questions: readonly string[];
};

export type ParsedIntent = TransferStableIntent | ClarifyIntent;

/**
 * H1.orchestration.intent — 极简规则解析（可替换为 LLM + schema）。
 * 匹配：转 + 数字 + U/USDT + 绑定 OKX 地址语义
 */
export function parseIntentFromUserText(
  text: string,
  ctx: UserProfileContext,
): ParsedIntent {
  const t = text.trim();
  const hasTransfer =
    /转|划|send|transfer/i.test(t) && /100|(\d+(\.\d+)?)/.test(t) && /u|usdt|美元/i.test(t);
  const mentionsBound =
    /绑定.*okx|绑定的.*okx|bound.*okx|my okx address|我.*okx.*地址/i.test(t) ||
    /到.*绑定|到.*okx/i.test(t);

  if (!hasTransfer) {
    return { kind: "clarify", questions: ["请说明要划转的金额与目标（例如：转 100U 到我绑定的 OKX 地址）"] };
  }

  const amountMatch = t.match(/(\d+(\.\d+)?)/);
  const amountUsd = amountMatch ? Number(amountMatch[1]) : NaN;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return { kind: "clarify", questions: ["未能识别金额，请指定例如 100U"] };
  }

  if (!mentionsBound) {
    return { kind: "clarify", questions: ["请确认目标为「绑定的 OKX 地址」，或提供明确收款地址"] };
  }

  if (!ctx.boundOkxAddress) {
    return {
      kind: "clarify",
      questions: ["尚未绑定 OKX 地址，请先在设置中完成绑定"],
    };
  }

  return {
    kind: "transfer_stable",
    amountUsd,
    destination: "bound_okx",
  };
}

export function assertReadyIntent(
  intent: ParsedIntent,
): intent is TransferStableIntent {
  return intent.kind === "transfer_stable";
}

/** 占位：风险与限额校验，后续接策略引擎 */
export function validateRiskOrThrow(intent: TransferStableIntent): void {
  if (intent.amountUsd > 1_000_000) {
    const code = h1ErrorCode("ORC", "AMOUNT_OVER_LIMIT");
    throw Object.assign(new Error(code), {
      code,
      userMessageKey: "transfer.amount_over_limit",
    });
  }
}
