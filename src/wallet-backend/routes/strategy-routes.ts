import * as http from "http";
import { parseBody } from "../http-utils";
import { homeFromToken } from "../cli-home";
import { getStatus, startStrategy, stopStrategy } from "../strategy/runner";
import { runTrendStrategy } from "../strategy/trend";
import { runGridStrategy } from "../strategy/grid";

export async function tryStrategyRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
  rawUrl?: string,
): Promise<boolean> {
  if (!url.startsWith("/api/v6/strategy/")) return false;

  const auth = (req.headers.authorization || "").replace("Bearer ", "");
  if (!auth) {
    res.writeHead(401);
    res.end(JSON.stringify({ ok: false, error: "未登录" }));
    return true;
  }

  let decoded: { home: string; email: string; accountId: string };
  try {
    decoded = homeFromToken(auth);
  } catch {
    res.writeHead(401);
    res.end(JSON.stringify({ ok: false, error: "无效的登录凭证" }));
    return true;
  }

  const userId = decoded.email;
  const home   = decoded.home;

  // GET /api/v6/strategy/status
  if (url === "/api/v6/strategy/status" && method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, ...getStatus(userId) }));
    return true;
  }

  // GET /api/v6/strategy/logs?since=<ts_ms>
  if (url.startsWith("/api/v6/strategy/logs") && method === "GET") {
    const qs = (rawUrl ?? url).includes("?") ? (rawUrl ?? url).split("?")[1] : "";
    const sinceParam = new URLSearchParams(qs).get("since");
    const since = sinceParam ? Number(sinceParam) : 0;
    const status = getStatus(userId);
    const logs = since > 0
      ? status.logs.filter((l: any) => (l.tsMs ?? 0) > since)
      : status.logs.slice(-80);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, logs, running: status.running, strategyId: status.strategyId }));
    return true;
  }

  // POST /api/v6/strategy/start
  if (url === "/api/v6/strategy/start" && method === "POST") {
    const raw = await parseBody(req);
    const strategyId: string = (raw as any)?.strategyId ?? "";
    if (!strategyId) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "缺少 strategyId" }));
      return true;
    }

    const runFn =
      strategyId === "trend" ? (uid: string) => runTrendStrategy(uid, home) :
      strategyId === "grid"  ? (uid: string) => runGridStrategy(uid, home)  :
      null;

    if (!runFn) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: `未知策略 ID：${strategyId}，支持 trend / grid` }));
      return true;
    }

    startStrategy(userId, strategyId, runFn);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, strategyId, msg: "策略已启动" }));
    return true;
  }

  // POST /api/v6/strategy/stop
  if (url === "/api/v6/strategy/stop" && method === "POST") {
    stopStrategy(userId);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, msg: "策略已停止" }));
    return true;
  }

  return false;
}
