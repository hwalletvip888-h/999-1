/**
 * sessionStore — 极简全局 session 状态（pub-sub）
 * 不引第三方状态库，所有需要登录态的地方订阅一下即可。
 */
import { useEffect, useState } from "react";
import {
  clearSession,
  loadSession,
  saveSession,
  type Session
} from "./walletApi";

type Listener = (s: Session | null) => void;

let current: Session | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(current);
}

export const sessionStore = {
  get(): Session | null {
    return current;
  },
  async hydrate(): Promise<Session | null> {
    current = await loadSession();
    emit();
    return current;
  },
  async set(s: Session): Promise<void> {
    current = s;
    await saveSession(s);
    emit();
  },
  async clear(): Promise<void> {
    current = null;
    await clearSession();
    emit();
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  }
};

/** Hook：组件中订阅 session 变化 */
export function useSession(): Session | null {
  const [s, setS] = useState<Session | null>(current);
  useEffect(() => sessionStore.subscribe(setS), []);
  return s;
}
