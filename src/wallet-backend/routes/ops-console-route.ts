import * as http from "http";
import { getOpsConsoleHtml } from "../ops-console-html";

/** 运营台 HTML 由后端从模板组装并注入路由表；须在设置 `Content-Type: application/json` 之前调用 */
export function tryServeOpsConsole(req: http.IncomingMessage, res: http.ServerResponse, url: string): boolean {
  if (url !== "/ops" && url !== "/ops/") return false;
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return true;
  }
  try {
    const html = getOpsConsoleHtml();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  } catch (e: any) {
    res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!DOCTYPE html><html><body><h1>运营台未就绪</h1><p>${String(e?.message || e || "unknown")}</p></body></html>`,
    );
  }
  return true;
}
