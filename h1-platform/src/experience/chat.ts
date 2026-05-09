import type { ExecutionResult } from "../orchestration/execution.js";

/** 完成卡片：供 UI 渲染（H1.experience.chat） */
export type CompletionCard = {
  kind: "transfer_completed";
  title: string;
  amountUsd: number;
  toMasked: string;
  orderId?: string;
  txHash?: string;
  traceId: string;
};

function maskAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function buildCompletionCard(input: {
  result: ExecutionResult;
  toAddress: string;
  amountUsd: number;
}): CompletionCard | null {
  const { result, toAddress, amountUsd } = input;
  if (!result.success || !result.txHash) return null;
  return {
    kind: "transfer_completed",
    title: "转账已完成",
    amountUsd,
    toMasked: maskAddress(toAddress),
    orderId: result.orderId,
    txHash: result.txHash,
    traceId: result.traceId,
  };
}
