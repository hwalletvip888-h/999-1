import * as fs from "fs";
import * as http from "http";
import * as nodePath from "path";

/** 运营台静态页；须在设置 `Content-Type: application/json` 之前调用 */
export function tryServeOpsConsole(req: http.IncomingMessage, res: http.ServerResponse, url: string): boolean {
  if (url !== "/ops" && url !== "/ops/") return false;
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return true;
  }
  const htmlPath = nodePath.join(process.cwd(), "ops-console", "index.html");
  try {
    const html = fs.readFileSync(htmlPath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  } catch {
    res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<!DOCTYPE html><html><body><h1>运营台未就绪</h1><p>缺少 ops-console/index.html</p></body></html>",
    );
  }
  return true;
}
