import { useEffect, useState } from "react";

/**
 * 跨屏 prompt 桥 —— 让卡库 / 钱包等界面能向聊天发起一次"代发问题"。
 * 模块级单例，零依赖。
 */

let pending: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export const chatBridge = {
  /** 设置一条待发送的 prompt（会触发订阅者刷新） */
  send(prompt: string) {
    pending = prompt;
    notify();
  },
  /** 取出并清空待发送 prompt */
  consume(): string | null {
    const p = pending;
    pending = null;
    notify();
    return p;
  },
  peek(): string | null {
    return pending;
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }
};

/** ChatScreen 用：拿到最新 pending prompt（不消费）。 */
export function usePendingPrompt(): string | null {
  const [p, setP] = useState<string | null>(chatBridge.peek());
  useEffect(() => {
    const unsubscribe = chatBridge.subscribe(() => setP(chatBridge.peek()));
    return () => { unsubscribe(); };
  }, []);
  return p;
}
