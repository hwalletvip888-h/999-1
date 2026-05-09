import * as http from "http";
import { handleAiChatRequest, handleAiIntentRequest } from "../ai-handlers";
import { parseBody } from "../http-utils";

export async function tryAiRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  if (url === "/api/ai/chat" && method === "POST") {
    const body = await parseBody(req);
    const out = await handleAiChatRequest(body);
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
    const body = await parseBody(req);
    const out = await handleAiIntentRequest(body);
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
