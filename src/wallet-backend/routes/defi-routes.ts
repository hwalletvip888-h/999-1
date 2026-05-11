import * as http from "http";
import { parseBody, INVALID_JSON_BODY } from "../http-utils";
import { handleDefiDiscover } from "../market-cli-handlers";

/**
 * `/api/v6/defi/*` — 链上赚币发现等（读路径经 onchainos）
 */
export async function tryDefiRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  const token = (req.headers.authorization || "").replace("Bearer ", "");

  if (url === "/api/v6/defi/discover" && method === "POST") {
    try {
      const raw = await parseBody(req);
      const body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      const data = handleDefiDiscover(token || undefined, body);
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (e: any) {
      if (e?.message === INVALID_JSON_BODY) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: e?.message || "discover failed" }));
      }
    }
    return true;
  }

  if (url === "/api/v6/defi/portfolio" && method === "POST") {
    res.writeHead(200);
    res.end(JSON.stringify([]));
    return true;
  }

  return false;
}
