/**
 * H1.experience 对齐：后端 AI 路由薄封装（业务在 aiChat）
 * `/api/ai/intent` 返回前经 `sanitizeIntentPayload`（`src/services/intentNormalize.ts`）白名单与字段清洗。
 *
 * 与 App 端解析层对齐：客户端 `src/services/ai-parse/parseUserIntent.ts`（本地命中非 chat 则短路）应与
 * `recognizeIntent` 内「先 localRuleIntent、再 LLM」的策略保持一致，避免双端意图漂移。
 */
import { chatWithAI, recognizeIntent, type ChatMessage } from "../services/aiChat";

export async function handleAiChatRequest(body: {
  messages?: ChatMessage[];
  message?: string;
}): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const { messages = [], message } = body;
  if (!message) {
    return { ok: false, error: "message is required" };
  }
  const reply = await chatWithAI(messages, message);
  return { ok: true, reply };
}

export async function handleAiIntentRequest(body: {
  message?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ ok: true; intent: unknown } | { ok: false; error: string }> {
  const { message, history = [] } = body;
  if (!message) {
    return { ok: false, error: "message is required" };
  }
  const intent = await recognizeIntent(message, undefined, history.slice(-6));
  return { ok: true, intent };
}
