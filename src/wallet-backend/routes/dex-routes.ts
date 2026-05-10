import * as http from "http";
import { parseBody } from "../http-utils";
import { handleSwapExecuteViaCli, handleSwapQuoteViaCli } from "../wallet-cli-handlers";
import { parseDexSwapBody } from "../schemas/walletDex";

export async function tryDexRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  const token = (req.headers.authorization || "").replace("Bearer ", "");

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
