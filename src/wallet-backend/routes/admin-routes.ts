import * as http from "http";
import { matchAdminRoute, type AdminOp } from "../admin-api-catalog";
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
import { sendTelegramTestMessage } from "../telegram-alert";

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

async function dispatchAdminOp(
  op: AdminOp,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  switch (op) {
    case "ping":
      json(res, 200, { ok: true, message: "ops-authorized" });
      return;
    case "overview":
      json(res, 200, adminOverviewPayload());
      return;
    case "system":
      json(res, 200, adminSystemPayload());
      return;
    case "trendStatus":
      json(res, 200, adminTrendStatusPayload());
      return;
    case "aiLimits":
      json(res, 200, adminAiLimitsPayload());
      return;
    case "diagnostics":
      json(res, 200, adminDiagnosticsPayload());
      return;
    case "settingsGet":
      json(res, 200, buildRuntimeSettingsPayload());
      return;
    case "settingsPost": {
      let body: unknown;
      try {
        body = await parseBody(req);
      } catch (e: any) {
        if (e?.message === "PAYLOAD_TOO_LARGE") {
          json(res, 413, { ok: false, error: "Request body too large" });
          return;
        }
        json(res, 400, { ok: false, error: "Invalid JSON body" });
        return;
      }
      const out = applyRuntimeSettingsPatch(body);
      if (!out.ok) {
        json(res, 400, { ok: false, error: out.error });
        return;
      }
      json(res, 200, out.payload);
      return;
    }
    case "telegramTest": {
      const r = await sendTelegramTestMessage();
      if (!r.ok) {
        json(res, 400, { ok: false, error: r.error });
        return;
      }
      json(res, 200, { ok: true, sent: true, message: "telegram_test_sent" });
      return;
    }
  }
}

export async function tryAdminRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  if (!url.startsWith("/api/admin/")) return false;

  if (method !== "GET" && method !== "POST") {
    json(res, 405, { ok: false, error: "Method Not Allowed" });
    return true;
  }
  if (!OPS_ADMIN_TOKEN) {
    json(res, 503, {
      ok: false,
      error: "Admin API disabled: set HWALLET_OPS_ADMIN_TOKEN on the server",
    });
    return true;
  }
  if (!assertOpsAuthorized(req)) {
    json(res, 401, { ok: false, error: "Unauthorized" });
    return true;
  }

  const op = matchAdminRoute(url, method);
  if (!op) {
    json(res, 404, { ok: false, error: "Unknown admin route" });
    return true;
  }

  await dispatchAdminOp(op, req, res);
  return true;
}
