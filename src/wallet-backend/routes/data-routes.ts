/**
 * 数据持久化路由 — 用户画像、对话、卡片、交易、分析事件 CRUD
 *
 * 所有接口需带 Authorization: Bearer <session_token>
 * token 为 base64({email, accountId, createdAt}) → 提取 email 作为用户标识
 */
import * as http from "http";
import { parseBody } from "../http-utils";
import { walletDb, type Conversation, type CardRecord, type TransactionRecord, type AnalyticsEvent, type ConversationMessage } from "../db";
import { decodeSessionToken } from "../cli-home";

// ─── 辅助：从请求中提取用户标识 ───────────────────────────

function resolveEmail(authHeader: string): { ok: true; email: string } | { ok: false; error: string } {
  const token = authHeader.replace("Bearer ", "");
  if (!token) return { ok: false, error: "Missing auth token" };
  try {
    const decoded = decodeSessionToken(token);
    return { ok: true, email: decoded.email };
  } catch (e: any) {
    return { ok: false, error: "Invalid or expired session: " + (e?.message || "") };
  }
}

// ─── 路由分发 ────────────────────────────────────────────────

export async function tryDataRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  const auth = req.headers.authorization || "";

  // ─── 用户画像 ─────────────────────────────────────────────
  if (url === "/api/data/profile" && method === "GET") {
    const user = resolveEmail(auth);
    if (!user.ok) { res.writeHead(401); res.end(JSON.stringify(user)); return true; }
    const data = walletDb.getOrCreate(user.email);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, profile: data.profile }));
    return true;
  }

  if (url === "/api/data/profile" && method === "PATCH") {
    const user = resolveEmail(auth);
    if (!user.ok) { res.writeHead(401); res.end(JSON.stringify(user)); return true; }
    const raw = await parseBody(req);
    if (!raw || typeof raw !== "object") {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "Invalid body" }));
      return true;
    }
    walletDb.updateProfile(user.email, raw as any);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // ─── 对话 ─────────────────────────────────────────────────
  if (url === "/api/data/conversations" && method === "GET") {
    const user = resolveEmail(auth);
    if (!user.ok) { res.writeHead(401); res.end(JSON.stringify(user)); return true; }
    const limit = parseInt((req as any).query?.limit || "50", 10);
    const conversations = walletDb.getConversations(user.email, limit);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, conversations }));
    return true;
  }

  if (url === "/api/data/conversations" && method === "POST") {
    const user = resolveEmail(auth);
    if (!user.ok) { res.writeHead(401); res.end(JSON.stringify(user)); return true; }
    const raw = await parseBody(req);
    if (!raw || !raw.id || !raw.title || !raw.messages) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "Missing required fields: id, title, messages" }));
      return true;
    }
    walletDb.addConversation(user.email, raw as Conversation);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  if (url.startsWith("/api/data/conversations/") && url.endsWith("/messages") && method === "POST") {
    const user = resolveEmail(auth);
    if (!user.ok) { res.writeHead(401); res.end(JSON.stringify(user)); return true; }
    const convId = url.split("/")[4]; // /api/data/conversations/{id}/messages
    const raw = await parseBody(req);
    if (!raw || !raw.role || !raw.content) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "Missing required fields: role, content" }));
      return true;
    }
    walletDb.appendMessage(user.email, convId, raw as ConversationMessage);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // ─── 卡片历史 ─────────────────────────────────────────────
  if (url === "/api/data/cards" && method === "GET") {
    const user = resolveEmail(auth);
    if (!user.ok) { res.writeHead(401); res.end(JSON.stringify(user)); return true; }
    const limit = parseInt((req as any).query?.limit || "50", 10);
    const cards = walletDb.getCards(user.email, limit);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, cards }));
    return true;
  }

  if (url === "/api/data/cards" && method === "POST") {
    const user = resolveEmail(auth);
    if (!user.ok) { res.writeHead(401); res.end(JSON.stringify(user)); return true; }
    const raw = await parseBody(req);
    if (!raw || !raw.id || !raw.actionType) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "Missing required fields: id, actionType" }));
      return true;
    }
    walletDb.addCard(user.email, raw as CardRecord);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // ─── 交易历史 ─────────────────────────────────────────────
  if (url === "/api/data/transactions" && method === "GET") {
    const user = resolveEmail(auth);
    if (!user.ok) { res.writeHead(401); res.end(JSON.stringify(user)); return true; }
    const limit = parseInt((req as any).query?.limit || "50", 10);
    const txs = walletDb.getTransactions(user.email, limit);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, transactions: txs }));
    return true;
  }

  if (url === "/api/data/transactions" && method === "POST") {
    const user = resolveEmail(auth);
    if (!user.ok) { res.writeHead(401); res.end(JSON.stringify(user)); return true; }
    const raw = await parseBody(req);
    if (!raw || !raw.id || !raw.action) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "Missing required fields: id, action" }));
      return true;
    }
    walletDb.addTransaction(user.email, raw as TransactionRecord);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  if (url.startsWith("/api/data/transactions/") && method === "PATCH") {
    const user = resolveEmail(auth);
    if (!user.ok) { res.writeHead(401); res.end(JSON.stringify(user)); return true; }
    const txId = url.split("/")[4];
    const raw = await parseBody(req);
    walletDb.updateTransaction(user.email, txId, raw as any);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // ─── 全量数据导出（用于 AI 训练/数据分析） ────────────────
  if (url === "/api/data/export" && method === "GET") {
    const user = resolveEmail(auth);
    if (!user.ok) { res.writeHead(401); res.end(JSON.stringify(user)); return true; }
    const data = walletDb.getOrCreate(user.email);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, data }));
    return true;
  }

  // ─── 分析事件 ─────────────────────────────────────────────
  if (url === "/api/data/events" && method === "POST") {
    const raw = await parseBody(req);
    if (!raw || !raw.eventType) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "Missing eventType" }));
      return true;
    }
    walletDb.addEvent(raw as AnalyticsEvent);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  if (url === "/api/data/events" && method === "GET") {
    // 可选 query params: ?eventType=xxx&limit=200
    const urlObj = new URL(url, "http://localhost");
    const eventType = urlObj.searchParams.get("eventType") || undefined;
    const limit = parseInt(urlObj.searchParams.get("limit") || "200", 10);
    const events = walletDb.getEvents(eventType, limit);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, events }));
    return true;
  }

  return false;
}
