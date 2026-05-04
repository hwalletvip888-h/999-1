/**
 * 邀请好友系统 — 本地持久化 + 订阅机制
 * 记录通过卡片分享邀请的好友
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type InvitedFriend = {
  id: string;
  nickname: string;
  email?: string;
  avatar?: string;       // emoji or url
  invitedAt: number;     // ms epoch
  cardId?: string;       // 通过哪张卡片邀请的
  cardTitle?: string;    // 卡片标题
  status: "pending" | "joined" | "active";
};

const STORAGE_KEY = "@hwallet/invites/v1";

let friends: InvitedFriend[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (!hydrated) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(friends)).catch(() => {});
  }, 300);
}

function notify() {
  listeners.forEach((fn) => fn());
  schedulePersist();
}

// 启动时 hydrate
(async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) friends = parsed;
    }
  } catch {
    /* ignore */
  } finally {
    hydrated = true;
    if (friends.length > 0) listeners.forEach((fn) => fn());
  }
})();

/** 生成邀请码（简单的 base36 随机串） */
function generateInviteCode(): string {
  return `H${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export const inviteStore = {
  list(): InvitedFriend[] {
    return friends;
  },

  count(): number {
    return friends.length;
  },

  /** 添加一个被邀请的好友 */
  addFriend(friend: Omit<InvitedFriend, "id" | "invitedAt">) {
    const newFriend: InvitedFriend = {
      ...friend,
      id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      invitedAt: Date.now(),
    };
    // 去重（同 email）
    friends = [newFriend, ...friends.filter((f) => f.email !== friend.email || !friend.email)];
    notify();
    return newFriend;
  },

  /** 更新好友状态 */
  updateStatus(friendId: string, status: InvitedFriend["status"]) {
    friends = friends.map((f) => (f.id === friendId ? { ...f, status } : f));
    notify();
  },

  /** 移除好友 */
  remove(friendId: string) {
    friends = friends.filter((f) => f.id !== friendId);
    notify();
  },

  /** 生成分享链接 */
  generateShareLink(cardId?: string): string {
    const code = generateInviteCode();
    return `https://h-wallet.app/invite/${code}${cardId ? `?card=${cardId}` : ""}`;
  },

  /** 生成邀请码 */
  generateCode(): string {
    return generateInviteCode();
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};

/** React hook — 订阅好友列表变更 */
export function useInvitedFriends(): InvitedFriend[] {
  const [list, setList] = useState<InvitedFriend[]>(inviteStore.list());
  useEffect(() => {
    const unsub = inviteStore.subscribe(() => setList([...inviteStore.list()]));
    return () => { unsub(); };
  }, []);
  return list;
}
