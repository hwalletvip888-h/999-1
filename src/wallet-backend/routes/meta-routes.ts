import * as http from "http";
import { H1_CAPABILITY_SCHEMA_VERSION, toMcpToolShapes } from "../h1-capabilities";
import { assertMetaCapabilitiesAuthorized } from "../meta-auth";

/**
 * 能力发现：单一事实来源 → 未来 MCP Server / OpenAPI 生成器消费
 * GET /api/meta/capabilities — 默认公开；若设置 HWALLET_META_CAPABILITIES_TOKEN 则须 `X-Hwallet-Meta-Token`
 */
export function tryMetaRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): boolean {
  if (url !== "/api/meta/capabilities" || method !== "GET") {
    return false;
  }
  if (!assertMetaCapabilitiesAuthorized(req)) {
    res.writeHead(401);
    res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
    return true;
  }
  res.writeHead(200);
  res.end(
    JSON.stringify({
      ok: true,
      schemaVersion: H1_CAPABILITY_SCHEMA_VERSION,
      service: "h-wallet-backend",
      note:
        "tools[] 对齐 MCP tools/list 的 name/description/inputSchema；_meta 为 H Wallet 对 HTTP 的扩展，非 MCP 协议字段。",
      tools: toMcpToolShapes(),
    }),
  );
  return true;
}
