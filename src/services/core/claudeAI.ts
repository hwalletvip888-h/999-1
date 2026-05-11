/**
 * AI Service — 通过后端 API 调用 (Claude + DeepSeek)
 * 意图识别: 后端 Claude API
 * 聊天对话: 后端 DeepSeek API
 *
 * 不再在前端直接调用 AI API，统一走后端（同源 `EXPO_PUBLIC_HWALLET_API_BASE`）。
 */
import { hwalletAbsoluteUrl } from "../walletApiCore";
import { fetchWithTimeout } from "../walletApiHttp";
import { localRuleIntent, sanitizeIntentPayload, type AIIntent } from "../intentNormalize";
import { tryLocalChatReply } from "../localChatReply";

export type { AIIntent };

/**
 * 意图识别 — 调用后端 /api/ai/intent (Claude)
 */
export async function askClaude(
  userMessage: string,
  abortSignal?: AbortSignal,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): Promise<AIIntent> {
  const url = hwalletAbsoluteUrl("/api/ai/intent");
  if (!url) {
    console.warn("[AI] EXPO_PUBLIC_HWALLET_API_BASE 未配置，使用本地意图规则");
    return localRuleIntent(userMessage);
  }

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage, history: history.slice(-6) }),
      signal: abortSignal,
    });

    if (!response.ok) {
      console.warn("[AI] Intent API error:", response.status);
      return localRuleIntent(userMessage);
    }

    const data = await response.json();
    if (data.ok && data.intent) {
      return sanitizeIntentPayload(data.intent);
    }
    return localRuleIntent(userMessage);
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return localRuleIntent(userMessage);
    }
    console.warn("[AI] Intent error:", err.message);
    return localRuleIntent(userMessage);
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * AI 聊天 — 调用后端 /api/ai/chat (DeepSeek)
 */
export async function chatWithAI(
  messages: ChatMessage[],
  userMessage: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  const local = tryLocalChatReply(userMessage);
  if (local) return local;

  const url = hwalletAbsoluteUrl("/api/ai/chat");
  if (!url) {
    return "⚠️ 未配置服务端地址（EXPO_PUBLIC_HWALLET_API_BASE），无法在客户端连接 AI 网关。";
  }

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, message: userMessage }),
      signal: abortSignal,
    });

    if (!response.ok) {
      console.warn("[AI] Chat API error:", response.status);
      return "⚠️ AI 服务暂时不可用，请稍后再试。";
    }

    const data = await response.json();
    if (data.ok && data.reply) {
      return data.reply;
    }
    return "🤔 我没有想到合适的回复，请换个方式问我吧。";
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return "（已取消本次回复）";
    }
    console.warn("[AI] Chat error:", err.message);
    return "⚠️ 网络连接失败，请检查网络后重试。";
  }
}
