import { MemoryCardVault } from "./engagement/cardVault.js";
import { buildCompletionCard } from "./experience/chat.js";
import { buildControlCenterSnapshot } from "./experience/controlCenter.js";
import type { H1IntegrationOkx } from "./integration/okx.js";
import { assertReadyIntent, parseIntentFromUserText, type UserProfileContext } from "./orchestration/intent.js";
import { planExecution, runExecution, type ExecutionResult } from "./orchestration/execution.js";
import { MemoryAuditPlatform, type AuditPlatform } from "./platform/audit.js";

export * from "./types/index.js";
export * from "./integration/okx.js";
export * from "./orchestration/intent.js";
export * from "./orchestration/execution.js";
export * from "./experience/chat.js";
export * from "./experience/controlCenter.js";
export * from "./engagement/cardVault.js";
export * from "./partner/directory.js";
export * from "./platform/audit.js";

export type DemoTransferFlowResult =
  | {
      status: "clarify";
      questions: readonly string[];
    }
  | {
      status: "ok";
      execution: ExecutionResult;
      completionCard: NonNullable<ReturnType<typeof buildCompletionCard>>;
      cardsInVault: number;
      auditEntriesForTrace: number;
    }
  | {
      status: "failed";
      execution: ExecutionResult;
      cardsInVault: number;
    };

/**
 * 端到端演示：用户一句 → intent → execution → 完成卡 → 卡库收录 → 审计可查。
 * App/BFF 后续用真实 H1IntegrationOkx 替换 Mock 即可。
 */
export async function runDemoTransferFlow(input: {
  userMessage: string;
  profile: UserProfileContext;
  integration: H1IntegrationOkx;
  audit?: AuditPlatform;
  cardVault?: MemoryCardVault;
}): Promise<DemoTransferFlowResult> {
  const audit = input.audit ?? new MemoryAuditPlatform();
  const cardVault = input.cardVault ?? new MemoryCardVault();

  const parsed = parseIntentFromUserText(input.userMessage, input.profile);
  if (!assertReadyIntent(parsed)) {
    return { status: "clarify", questions: parsed.questions };
  }

  const bound = input.profile.boundOkxAddress;
  if (!bound) {
    return { status: "clarify", questions: ["尚未绑定 OKX 地址"] };
  }

  const plan = planExecution({
    intent: parsed,
    resolvedToAddress: bound,
  });

  const execution = await runExecution({
    plan,
    integration: input.integration,
    audit,
  });

  if (!execution.success) {
    return { status: "failed", execution, cardsInVault: cardVault.getCollection().length };
  }

  const completionCard = buildCompletionCard({
    result: execution,
    toAddress: bound,
    amountUsd: parsed.amountUsd,
  });

  if (!completionCard) {
    return {
      status: "failed",
      execution,
      cardsInVault: cardVault.getCollection().length,
    };
  }

  cardVault.onTradeConfirmed({
    traceId: execution.traceId,
    intentType: "transfer_stable",
    txHash: execution.txHash,
    orderId: execution.orderId,
    timestamp: Date.now(),
    sanitizedMeta: { amountUsd: parsed.amountUsd },
  });

  return {
    status: "ok",
    execution,
    completionCard,
    cardsInVault: cardVault.getCollection().length,
    auditEntriesForTrace: audit.queryTrace(execution.traceId).length,
  };
}

/** 中控台只读入口（与对话并行使用） */
export function getControlCenterPreview(profile: UserProfileContext) {
  return buildControlCenterSnapshot(profile);
}
