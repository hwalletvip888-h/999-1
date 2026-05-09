import type { TraceId } from "../types/h1-errors.js";

export type AuditLogEntry = {
  name: string;
  traceId: TraceId;
  at: number;
  payload?: Record<string, unknown>;
};

export interface AuditPlatform {
  log(event: { name: string; traceId: TraceId; payload?: Record<string, unknown> }): void;
  queryTrace(traceId: TraceId): readonly AuditLogEntry[];
}

/**
 * H1.platform.audit — 结构化日志与按 trace 查询（内存实现，可换持久化）。
 */
export class MemoryAuditPlatform implements AuditPlatform {
  private readonly entries: AuditLogEntry[] = [];

  log(event: { name: string; traceId: TraceId; payload?: Record<string, unknown> }): void {
    this.entries.push({
      name: event.name,
      traceId: event.traceId,
      at: Date.now(),
      payload: event.payload,
    });
  }

  queryTrace(traceId: TraceId): readonly AuditLogEntry[] {
    return this.entries.filter((e) => e.traceId === traceId);
  }

  all(): readonly AuditLogEntry[] {
    return [...this.entries];
  }
}
