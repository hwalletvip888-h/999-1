/**
 * 人类运营台：Admin API 鉴权 + 沙箱列表 + overview 载荷
 */
import * as fs from "fs";
import * as http from "http";
import * as nodePath from "path";
import { CLI_HOME_ROOT, OKX_API_KEY, OKX_SECRET_KEY, OPS_ADMIN_TOKEN, WALLET_PORT } from "./config";
import { ensureCliHomeRoot } from "./cli-home";
import { isOnchainosCliAvailable } from "./onchainos-cli";

export function readOpsKey(req: http.IncomingMessage): string {
  const x = String(req.headers["x-ops-key"] || "").trim();
  if (x) return x;
  const auth = String(req.headers.authorization || "").trim();
  if (auth.toLowerCase().startsWith("ops ")) return auth.slice(4).trim();
  return "";
}

export function assertOpsAuthorized(req: http.IncomingMessage): boolean {
  if (!OPS_ADMIN_TOKEN) return false;
  return readOpsKey(req) === OPS_ADMIN_TOKEN;
}

export function listCliSandboxes(): { sandboxId: string; mtimeMs: number }[] {
  ensureCliHomeRoot();
  try {
    const entries = fs.readdirSync(CLI_HOME_ROOT, { withFileTypes: true });
    const rows: { sandboxId: string; mtimeMs: number }[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const p = nodePath.join(CLI_HOME_ROOT, e.name);
      try {
        const st = fs.statSync(p);
        rows.push({ sandboxId: e.name, mtimeMs: st.mtimeMs });
      } catch {
        rows.push({ sandboxId: e.name, mtimeMs: 0 });
      }
    }
    rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return rows;
  } catch {
    return [];
  }
}

export function adminOverviewPayload(): Record<string, unknown> {
  const health = {
    ok: true,
    service: "h-wallet-backend",
    agentWallet: isOnchainosCliAvailable() ? "cli-per-user" : "unavailable",
    cliHomeRoot: CLI_HOME_ROOT,
    mode: "okx-agentic-real",
    ai: "deepseek+claude",
  };
  const sandboxes = listCliSandboxes();
  return {
    ok: true,
    health,
    cliSandboxes: sandboxes,
    config: {
      walletPort: WALLET_PORT,
      cliHomeRoot: CLI_HOME_ROOT,
      okxApiKeyConfigured: Boolean(OKX_API_KEY && OKX_SECRET_KEY),
      opsAdminConfigured: Boolean(OPS_ADMIN_TOKEN),
    },
  };
}
