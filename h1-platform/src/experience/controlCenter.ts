import type { UserProfileContext } from "../orchestration/intent.js";

/** 中控台只读模型（H1.experience.controlCenter） */
export type ControlCenterSnapshot = {
  userId: string;
  headline: string;
  boundOkxMasked?: string;
};

export function buildControlCenterSnapshot(ctx: UserProfileContext): ControlCenterSnapshot {
  const bound = ctx.boundOkxAddress;
  return {
    userId: ctx.userId,
    headline: "资金中控台",
    boundOkxMasked: bound && bound.length > 12 ? `${bound.slice(0, 6)}…${bound.slice(-4)}` : bound,
  };
}
