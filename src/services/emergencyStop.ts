/**
 * emergencyStop — 第四锁：一键紧急停止。
 *
 * 设计要点（PRD 五道安全锁第四条）：
 *   - App 任意界面始终显示红色按钮
 *   - 触发后：所有策略立即暂停 → AI 在安全时间点平仓 → 全流程不超过 5 分钟
 *   - 不强制即时平仓，避免最差价格
 *
 * 当前实现：发广播事件 + 标记所有 running 卡片为 emergencyStopRef，
 *           agentRunner 自行 stop 全部，UI 自行响应红色覆盖层。
 */
import { useEffect, useState } from "react";
import { cardLibrary } from "./cardLibrary";
import { getAgentRunner } from "./agentRunner";
import { toastBus } from "./toastBus";

export type EmergencyState = {
  active: boolean;
  triggeredAt: number | null;
  reason: string;
  stoppedCardIds: string[];
};

let state: EmergencyState = {
  active: false,
  triggeredAt: null,
  reason: "",
  stoppedCardIds: []
};

const listeners = new Set<(s: EmergencyState) => void>();

function emit() {
  for (const l of listeners) l(state);
}

export const emergencyStop = {
  get(): EmergencyState {
    return state;
  },
  /**
   * 触发紧急停止：
   *   1. 给所有 running 卡片打 emergencyStopRef 标记
   *   2. 调 agentRunner.stop() 关掉策略
   *   3. 广播 toast 通知用户
   */
  async trigger(reason = "用户手动触发"): Promise<void> {
    if (state.active) return;
    const triggeredAt = Date.now();
    const ref = `emerg_${triggeredAt}`;

    const all = cardLibrary.list();
    const runningIds = all
      .filter((c) => c.status === "running" || c.status === "executed" || c.status === "confirmed")
      .map((c) => c.id);

    state = { active: true, triggeredAt, reason, stoppedCardIds: runningIds };
    emit();

    toastBus.push({
      emoji: "🛑",
      title: "紧急停止已触发",
      subtitle: `${runningIds.length} 个运行中策略将在 5 分钟内停止`,
      tone: "warn",
      duration: 4500
    });

    // 1) 标记卡片
    for (const id of runningIds) {
      // emergencyStopRef 在 cardLibrary 的 SavedCard 上是可选字段
      // updateStatus 不带 ref，所以通过 add({...,emergencyStopRef:ref}) 重新写入
      const card = all.find((c) => c.id === id);
      if (card) {
        cardLibrary.add({ ...card, emergencyStopRef: ref });
      }
    }

    // 2) 关掉 agentRunner（注意：MockAgentRunner.stop 需要 id；LiveAgentRunner.stop() 不传 id 会全停）
    try {
      const runner = getAgentRunner();
      const list = runner.list();
      for (const a of list) {
        // 类型上 id 必有
        await runner.stop(a.id);
      }
    } catch (err) {
      console.warn("[emergencyStop] stop runners failed", err);
    }
  },
  /** 解除紧急停止状态（不会自动恢复策略，用户重新启动） */
  clear(): void {
    if (!state.active) return;
    state = { active: false, triggeredAt: null, reason: "", stoppedCardIds: [] };
    emit();
    toastBus.push({
      emoji: "✅",
      title: "紧急状态已解除",
      subtitle: "你可以重新启动策略",
      tone: "success",
      duration: 2400
    });
  },
  subscribe(fn: (s: EmergencyState) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }
};

/** Hook：响应式订阅紧急状态 */
export function useEmergencyState(): EmergencyState {
  const [s, setS] = useState<EmergencyState>(state);
  useEffect(() => emergencyStop.subscribe(setS), []);
  return s;
}
