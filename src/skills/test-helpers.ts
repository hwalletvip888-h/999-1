// 单元测试工具: 构造 mock SkillCtx + UI 模拟器
// 仅用于 *.test.ts, 不进生产代码路径.

import type { SkillCtx } from "./types";

export interface MockUiState {
  cards: Array<{ kind: string; data: unknown }>;
  events: Array<{ kind: string; data: unknown }>;
  /** 未来 awaitConfirm 的返回值队列, push true/false 控制 */
  confirmQueue: boolean[];
}

export interface MockCtxOpts {
  /** 风险层是否放行 (默认放行) */
  riskOk?: boolean;
  /** 风险层拒绝时的理由 */
  riskReason?: string;
  /** 用户在确认门点的反应队列 (默认 [true]) */
  confirmQueue?: boolean[];
  /** 运行时模式 (默认 mock) */
  runtimeMode?: SkillCtx["runtimeMode"];
}

/** 构造一个 mock SkillCtx + 暴露内部状态便于断言. */
export function makeMockCtx(opts: MockCtxOpts = {}): {
  ctx: SkillCtx;
  ui: MockUiState;
} {
  const ui: MockUiState = {
    cards: [],
    events: [],
    confirmQueue: [...(opts.confirmQueue ?? [true])],
  };

  const ctx: SkillCtx = {
    userId: "test-user",
    sessionId: "test-session",
    runtimeMode: opts.runtimeMode ?? "mock",
    ui: {
      showCard: async (kind, data) => {
        ui.cards.push({ kind, data });
      },
      awaitConfirm: async () => {
        if (ui.confirmQueue.length === 0) return false;
        return ui.confirmQueue.shift() as boolean;
      },
      pushEvent: (kind, data) => {
        ui.events.push({ kind, data });
      },
    },
    okx: null,
    risk: {
      preCompileCheck: async () => ({
        ok: opts.riskOk ?? true,
        reason: opts.riskReason,
      }),
    },
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };

  return { ctx, ui };
}
