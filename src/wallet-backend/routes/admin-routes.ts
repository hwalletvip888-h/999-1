import * as http from "http";
import {
  adminAiLimitsPayload,
  adminDiagnosticsPayload,
  adminOverviewPayload,
  adminSystemPayload,
  adminTrendStatusPayload,
  assertOpsAuthorized,
} from "../admin-ops";
import { OPS_ADMIN_TOKEN } from "../config";
import { parseBody } from "../http-utils";
import { applyRuntimeSettingsPatch, buildRuntimeSettingsPayload } from "../runtime-settings";

export async function tryAdminRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  if (!url.startsWith("/api/admin/")) return false;

  if (method !== "GET" && method !== "POST") {
    res.writeHead(405);
    res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
    return true;
  }
  if (!OPS_ADMIN_TOKEN) {
    res.writeHead(503);
    res.end(
      JSON.stringify({
        ok: false,
        error: "Admin API disabled: set HWALLET_OPS_ADMIN_TOKEN on the server",
      }),
    );
    return true;
  }
  if (!assertOpsAuthorized(req)) {
    res.writeHead(401);
    res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
    return true;
  }
  if (url === "/api/admin/overview" && method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify(adminOverviewPayload()));
    return true;
  }
  if (url === "/api/admin/system" && method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify(adminSystemPayload()));
    return true;
  }
  if (url === "/api/admin/trend-status" && method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify(adminTrendStatusPayload()));
    return true;
  }
  if (url === "/api/admin/ai-limits" && method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify(adminAiLimitsPayload()));
    return true;
  }
  if (url === "/api/admin/diagnostics" && method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify(adminDiagnosticsPayload()));
    return true;
  }
  if (url === "/api/admin/settings" && method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify(buildRuntimeSettingsPayload()));
    return true;
  }
  if (url === "/api/admin/settings" && method === "POST") {
    let body: unknown;
    try {
      body = await parseBody(req);
    } catch (e: any) {
      if (e?.message === "PAYLOAD_TOO_LARGE") {
        res.writeHead(413);
        res.end(JSON.stringify({ ok: false, error: "Request body too large" }));
        return true;
      }
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
      return true;
    }
    const out = applyRuntimeSettingsPatch(body);
    if (!out.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: out.error }));
      return true;
    }
    res.writeHead(200);
    res.end(JSON.stringify(out.payload));
    return true;
  }
  if (url === "/api/admin/ping" && method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, message: "ops-authorized" }));
    return true;
  }
  res.writeHead(404);
  res.end(JSON.stringify({ ok: false, error: "Unknown admin route" }));
  return true;
}
