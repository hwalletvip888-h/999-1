import { randomUUID } from "node:crypto";
import type { H1IntegrationOkx } from "../integration/okx.js";
import type { AuditPlatform } from "../platform/audit.js";
import type { TraceId } from "../types/h1-errors.js";
import type { TransferStableIntent } from "./intent.js";
import { validateRiskOrThrow } from "./intent.js";

export const H1_EXECUTION_EVENTS = {
  phaseStart: "h1.orchestration.execution.phase_start",
  phaseEnd: "h1.orchestration.execution.phase_end",
  txSubmitted: "h1.orchestration.execution.tx_submitted",
  completed: "h1.orchestration.execution.completed",
  failed: "h1.orchestration.execution.failed",
} as const;

export type ExecutionPhase = { id: string; userLabel: string };

export interface ExecutionPlan {
  idempotencyKey: string;
  traceId: TraceId;
  publicPhases: ExecutionPhase[];
  intent: TransferStableIntent;
  toAddress: string;
}

export interface ExecutionResult {
  success: boolean;
  traceId: TraceId;
  txHash?: string;
  orderId?: string;
  errorCode?: string;
  userMessageKey?: string;
}

export type ExecutionEvent = {
  name: string;
  traceId: TraceId;
  phaseId?: string;
  userLabel?: string;
  payload?: Record<string, unknown>;
};

export type ExecutionEventListener = (e: ExecutionEvent) => void;

/**
 * H1.orchestration.execution — 计划 + 执行 + 阶段事件（供动效 / 审计）。
 */
export function planExecution(input: {
  intent: TransferStableIntent;
  resolvedToAddress: string;
}): ExecutionPlan {
  validateRiskOrThrow(input.intent);
  const traceId = randomUUID();
  return {
    idempotencyKey: `idem_${traceId}`,
    traceId,
    intent: input.intent,
    toAddress: input.resolvedToAddress,
    publicPhases: [
      { id: "verify", userLabel: "确认收款信息" },
      { id: "route", userLabel: "准备资金路径" },
      { id: "submit", userLabel: "发起链上转账" },
    ],
  };
}

export async function runExecution(input: {
  plan: ExecutionPlan;
  integration: H1IntegrationOkx;
  audit: AuditPlatform;
  onEvent?: ExecutionEventListener;
}): Promise<ExecutionResult> {
  const { plan, integration, audit, onEvent } = input;
  const emit = (e: ExecutionEvent) => {
    const { name, traceId, phaseId, userLabel, payload } = e;
    const p: Record<string, unknown> = {};
    if (phaseId !== undefined) p.phaseId = phaseId;
    if (userLabel !== undefined) p.userLabel = userLabel;
    if (payload) Object.assign(p, payload);
    audit.log({ name, traceId, payload: Object.keys(p).length ? p : undefined });
    onEvent?.(e);
  };

  try {
    for (const phase of plan.publicPhases) {
      emit({
        name: H1_EXECUTION_EVENTS.phaseStart,
        traceId: plan.traceId,
        phaseId: phase.id,
        userLabel: phase.userLabel,
      });
      emit({
        name: H1_EXECUTION_EVENTS.phaseEnd,
        traceId: plan.traceId,
        phaseId: phase.id,
        userLabel: phase.userLabel,
      });
    }

    const out = await integration.submitTransfer({
      traceId: plan.traceId,
      amountUsd: plan.intent.amountUsd,
      toAddress: plan.toAddress,
    });

    emit({
      name: H1_EXECUTION_EVENTS.txSubmitted,
      traceId: plan.traceId,
      payload: { orderId: out.orderId },
    });

    emit({ name: H1_EXECUTION_EVENTS.completed, traceId: plan.traceId });

    return {
      success: true,
      traceId: plan.traceId,
      txHash: out.txHash,
      orderId: out.orderId,
    };
  } catch (err: unknown) {
    const e = err as { code?: string; userMessageKey?: string; message?: string };
    const errorCode = e.code ?? "H1.OKX.UNKNOWN";
    const userMessageKey = e.userMessageKey ?? "transfer.generic_error";
    emit({
      name: H1_EXECUTION_EVENTS.failed,
      traceId: plan.traceId,
      payload: { errorCode, userMessageKey },
    });
    return {
      success: false,
      traceId: plan.traceId,
      errorCode,
      userMessageKey,
    };
  }
}
