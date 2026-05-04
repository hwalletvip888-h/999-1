import { useEffect, useState } from "react";

/**
 * 全局通知条 — 极简发布订阅。任何 service / screen 都能 push 一条横幅。
 * UI 由 <AppToast /> 渲染（挂在 App.tsx 顶层）。
 */

export type ToastTone = "success" | "info" | "warn";

export type ToastPayload = {
  id: string;
  emoji?: string;
  title: string;
  subtitle?: string;
  tone?: ToastTone;
  /** 显示时长（ms），默认 2400 */
  duration?: number;
};

const listeners = new Set<(t: ToastPayload) => void>();

let seq = 0;

export const toastBus = {
  push(p: Omit<ToastPayload, "id">) {
    seq++;
    const payload: ToastPayload = { ...p, id: `toast_${Date.now()}_${seq}` };
    listeners.forEach((fn) => fn(payload));
  },
  subscribe(fn: (t: ToastPayload) => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }
};

/** Hook：组件订阅最新的 toast。 */
export function useToastListener(handler: (t: ToastPayload) => void) {
  useEffect(() => {
    const unsubscribe = toastBus.subscribe(handler);
    return () => { unsubscribe(); };
  }, [handler]);
}

/** 便捷 hook：返回当前栈，外部一般不需要。 */
export function useToastQueue(): ToastPayload[] {
  const [queue, setQueue] = useState<ToastPayload[]>([]);
  useEffect(() => {
    const unsubscribe = toastBus.subscribe((t) => setQueue((cur) => [...cur, t]));
    return () => { unsubscribe(); };
  }, []);
  return queue;
}
