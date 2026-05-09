import * as http from "http";
import { handleAiChatRequest, handleAiIntentRequest } from "../ai-handlers";
import { parseBody } from "../http-utils";
import { parseAiChatBody, parseAiIntentBody } from "../schemas/ai";

export async function tryAiRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  if (url === "/api/ai/chat" && method === "POST") {
    const raw = await parseBody(req);
    const parsed = parseAiChatBody(raw);
    if (!parsed.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: parsed.error }));
      return true;
    }
    const out = await handleAiChatRequest(parsed.data);
    if (!out.ok) {
      res.writeHead(400);
      res.end(JSON.stringify(out));
      return true;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, reply: out.reply }));
    return true;
  }
  if (url === "/api/ai/intent" && method === "POST") {
    const raw = await parseBody(req);
    const parsed = parseAiIntentBody(raw);
    if (!parsed.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: parsed.error }));
      return true;
    }
    const out = await handleAiIntentRequest(parsed.data);
    if (!out.ok) {
      res.writeHead(400);
      res.end(JSON.stringify(out));
      return true;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, intent: out.intent }));
    return true;
  }
  return false;
}
