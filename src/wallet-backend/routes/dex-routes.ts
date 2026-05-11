import * as http from "http";
import { parseBody, INVALID_JSON_BODY } from "../http-utils";
import {
  handleDexHotTokens,
  handleDexSignalList,
  handleDexTrackerActivities,
} from "../market-cli-handlers";
import { handleSwapExecuteViaCli, handleSwapQuoteViaCli } from "../wallet-cli-handlers";
import { parseDexSwapBody } from "../schemas/walletDex";

export async function tryDexRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  const token = (req.headers.authorization || "").replace("Bearer ", "");

  if (url === "/api/v6/dex/signal" && method === "POST") {
    try {
      const raw = await parseBody(req);
      const body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      const data = handleDexSignalList(token || undefined, body);
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (e: any) {
      if (e?.message === INVALID_JSON_BODY) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: e?.message || "signal failed" }));
      }
    }
    return true;
  }

  if (url === "/api/v6/dex/hot-tokens" && method === "POST") {
    try {
      const raw = await parseBody(req);
      const body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      const data = handleDexHotTokens(token || undefined, body);
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (e: any) {
      if (e?.message === INVALID_JSON_BODY) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: e?.message || "hot-tokens failed" }));
      }
    }
    return true;
  }

  if (url === "/api/v6/dex/tracker" && method === "POST") {
    try {
      const raw = await parseBody(req);
      const body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      const data = handleDexTrackerActivities(token || undefined, body);
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (e: any) {
      if (e?.message === INVALID_JSON_BODY) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: e?.message || "tracker failed" }));
      }
    }
    return true;
  }

  if (url === "/api/v6/dex/swap-quote" && method === "POST") {
    const raw = await parseBody(req);
    const parsed = parseDexSwapBody(raw);
    if (!parsed.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: parsed.error }));
      return true;
    }
    const result = await handleSwapQuoteViaCli(token, parsed.data);
    if (!result?.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: result?.error || "swap quote failed" }));
      return true;
    }
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return true;
  }
  if (url === "/api/v6/dex/swap-execute" && method === "POST") {
    const raw = await parseBody(req);
    const parsed = parseDexSwapBody(raw);
    if (!parsed.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: parsed.error }));
      return true;
    }
    const result = await handleSwapExecuteViaCli(token, parsed.data);
    if (!result?.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: result?.error || "swap execute failed" }));
      return true;
    }
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return true;
  }
  return false;
}
