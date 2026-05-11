/**
 * 数据持久化客户端 API — 对话、卡片、交易、分析事件
 *
 * 与后端 `/api/data/*` 路由通信，自动带 Authorization token。
 * 静默失败（不阻塞主流程），日志记录错误。
 */
import { hwalletAbsoluteUrl } from "../walletApiCore";
import { fetchWithTimeout } from "../walletApiHttp";
import { loadSession } from "../walletApi";
import { makeId } from "../../utils/id";

// ─── 辅助 ────────────────────────────────────────────────────

async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<any | null> {
  const base = hwalletAbsoluteUrl(path);
  if (!base) return null;
  const session = await loadSession();
  if (!session?.token) return null;
  try {
    const res = await fetchWithTimeout(base, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      console.warn(`[dataApi] ${path} failed: HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err: any) {
    console.warn(`[dataApi] ${path} error:`, err?.message);
    return null;
  }
}

// ─── 用户画像 ────────────────────────────────────────────────

export async function saveUserProfile(patch: {
  nickname?: string;
  avatar?: string;
}): Promise<boolean> {
  const res = await authFetch("/api/data/profile", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return res?.ok === true;
}

// ─── 对话 ────────────────────────────────────────────────────

export async function saveConversation(conv: {
  id: string;
  title: string;
  messages: Array<{ role: "user" | "assistant"; content: string; intent?: string; createdAt: string }>;
}): Promise<boolean> {
  const res = await authFetch("/api/data/conversations", {
    method: "POST",
    body: JSON.stringify({
      id: conv.id,
      title: conv.title,
      messages: conv.messages.map(m => ({
        ...m,
        createdAt: m.createdAt || new Date().toISOString(),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  });
  return res?.ok === true;
}

export async function appendConversationMessage(
  conversationId: string,
  msg: { role: "user" | "assistant"; content: string; intent?: string },
): Promise<boolean> {
  const res = await authFetch(`/api/data/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      ...msg,
      createdAt: new Date().toISOString(),
    }),
  });
  return res?.ok === true;
}

// ─── 卡片 ────────────────────────────────────────────────────

export async function saveCard(card: {
  id: string;
  actionType: string;
  symbol?: string;
  amount?: number;
  cardData: any;
  conversationId?: string;
}): Promise<boolean> {
  const res = await authFetch("/api/data/cards", {
    method: "POST",
    body: JSON.stringify({
      ...card,
      createdAt: new Date().toISOString(),
    }),
  });
  return res?.ok === true;
}

// ─── 交易 ────────────────────────────────────────────────────

export async function saveTransaction(tx: {
  id: string;
  chain: string;
  action: string;
  symbol: string;
  amount: number;
  status: "pending" | "confirmed" | "failed";
  txHash?: string;
  fee?: string;
  errorMsg?: string;
  conversationId?: string;
}): Promise<boolean> {
  const body: any = { ...tx, createdAt: new Date().toISOString() };
  // 成功交易记录完成时间
  if (tx.status === "confirmed" || tx.status === "failed") {
    body.completedAt = new Date().toISOString();
  }
  const res = await authFetch("/api/data/transactions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res?.ok === true;
}

export async function updateTransactionStatus(
  txId: string,
  patch: { status: "pending" | "confirmed" | "failed"; txHash?: string; errorMsg?: string },
): Promise<boolean> {
  const body: any = { ...patch };
  if (patch.status === "confirmed" || patch.status === "failed") {
    body.completedAt = new Date().toISOString();
  }
  const res = await authFetch(`/api/data/transactions/${txId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return res?.ok === true;
}

// ─── 分析事件 ────────────────────────────────────────────────

export async function trackEvent(
  eventType: string,
  payload: Record<string, any> = {},
): Promise<boolean> {
  const session = await loadSession();
  const res = await authFetch("/api/data/events", {
    method: "POST",
    body: JSON.stringify({
      id: makeId("evt"),
      walletAddress: session?.email || undefined,
      eventType,
      payload,
      createdAt: new Date().toISOString(),
    }),
  });
  return res?.ok === true;
}

/**
 * 快捷事件追踪（静默、不等待）
 */
export function trackEventQuick(eventType: string, payload?: Record<string, any>): void {
  trackEvent(eventType, payload).catch(() => {});
}
