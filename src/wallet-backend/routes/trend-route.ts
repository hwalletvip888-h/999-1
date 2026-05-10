import * as http from "http";
import { readLatestTrendReportFromDisk } from "../trend-from-disk";

/** GET /api/trend — 供 RN 客户端拉取与 trend_engine 对齐的趋势摘要（无数据时 report 为 null） */
export function tryTrendRoute(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): boolean {
  if (url !== "/api/trend" || method !== "GET") {
    return false;
  }
  const report = readLatestTrendReportFromDisk();
  res.writeHead(200);
  res.end(JSON.stringify({ ok: true, report }));
  return true;
}
