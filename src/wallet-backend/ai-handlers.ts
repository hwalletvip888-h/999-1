/**
 * H1.experience 对齐：后端 AI 路由薄封装（业务在 aiChat）
 * `/api/ai/intent` 返回前经 `sanitizeIntentPayload`（`src/services/intentNormalize.ts`）白名单与字段清洗。
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
}): Promise<{ ok: true; intent: unknown } | { ok: false; error: string }> {
  const { message } = body;
  if (!message) {
    return { ok: false, error: "message is required" };
  }
  const intent = await recognizeIntent(message);
  return { ok: true, intent };
}
