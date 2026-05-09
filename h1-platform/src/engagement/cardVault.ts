import type { TraceId } from "../types/h1-errors.js";

export type TradeConfirmedEvent = {
  traceId: TraceId;
  intentType: string;
  txHash?: string;
  orderId?: string;
  timestamp: number;
  sanitizedMeta: Record<string, unknown>;
};

export type CollectedCard = {
  id: string;
  traceId: TraceId;
  intentType: string;
  txHash?: string;
  collectedAt: number;
};

/**
 * H1.engagement.cardVault — 交易确认后收录（幂等按 traceId）。
 */
export class MemoryCardVault {
  private readonly byTrace = new Map<TraceId, CollectedCard>();

  onTradeConfirmed(event: TradeConfirmedEvent): CollectedCard | null {
    if (this.byTrace.has(event.traceId)) {
      return this.byTrace.get(event.traceId)!;
    }
    const card: CollectedCard = {
      id: `card_${event.traceId.slice(0, 8)}`,
      traceId: event.traceId,
      intentType: event.intentType,
      txHash: event.txHash,
      collectedAt: event.timestamp,
    };
    this.byTrace.set(event.traceId, card);
    return card;
  }

  getCollection(): readonly CollectedCard[] {
    return [...this.byTrace.values()].sort((a, b) => b.collectedAt - a.collectedAt);
  }
}
