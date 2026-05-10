/**
 * 人类运营台：Admin API 鉴权 + 沙箱列表 + overview 载荷
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as nodePath from "path";
import {
  CLI_HOME_ROOT,
  META_CAPABILITIES_TOKEN,
  OKX_API_KEY,
  OKX_PROJECT_ID,
  OKX_SECRET_KEY,
  OPS_ADMIN_TOKEN,
  WALLET_PORT,
} from "./config";
import { getAiRateLimitStats } from "./ai-rate-limit";
import { ensureCliHomeRoot } from "./cli-home";
import { buildBffHttpRouteCatalog } from "./h1-capabilities";
import { isOnchainosCliAvailable } from "./onchainos-cli";
import { readLatestTrendReportFromDisk } from "./trend-from-disk";
import {
  getEffectiveExternalLlmFetchTimeoutMs,
  getEffectiveTrendOutputDir,
  getExternalLlmFetchTimeoutEnvBaseline,
  getRuntimeSettingsFilePath,
} from "./runtime-settings";
import {
  FETCH_TIMEOUT_MS,
  OKX_AGENTIC_FETCH_TIMEOUT_MS,
  OTP_POST_DEADLINE_MS,
} from "../services/hwalletHttpConstants";

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

export function adminSystemPayload(): Record<string, unknown> {
  const m = process.memoryUsage();
  return {
    ok: true,
    uptimeSec: Math.floor(process.uptime()),
    node: process.version,
    pid: process.pid,
    platform: process.platform,
    memory: {
      rss: m.rss,
      heapUsed: m.heapUsed,
      heapTotal: m.heapTotal,
    },
  };
}

export function adminTrendStatusPayload(): Record<string, unknown> {
  const r = readLatestTrendReportFromDisk();
  if (!r) {
    return { ok: true, hasReport: false, summary: null };
  }
  return {
    ok: true,
    hasReport: true,
    summary: {
      symbol: r.symbol,
      timestamp: r.timestamp,
      overallScore: r.overallScore,
      direction: r.direction,
      directionCn: r.directionCn,
      currentPrice: r.currentPrice,
    },
  };
}

export function adminAiLimitsPayload(): Record<string, unknown> {
  return { ok: true, ...getAiRateLimitStats() };
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
      okxProjectIdConfigured: Boolean(String(OKX_PROJECT_ID || "").trim()),
      opsAdminConfigured: Boolean(OPS_ADMIN_TOKEN),
      metaCapabilitiesEnforced: Boolean(META_CAPABILITIES_TOKEN),
    },
  };
}

function readPackageBrief(): { name: string | null; version: string | null } {
  try {
    const p = nodePath.join(process.cwd(), "package.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as { name?: string; version?: string };
    return { name: j.name ? String(j.name) : null, version: j.version ? String(j.version) : null };
  } catch {
    return { name: null, version: null };
  }
}

function onchainosVersionLine(): string | null {
  if (!isOnchainosCliAvailable()) return null;
  try {
    const out = execFileSync("onchainos", ["--version"], { encoding: "utf8", timeout: 5_000 }).trim();
    return out ? out.slice(0, 500) : null;
  } catch {
    return null;
  }
}

function runtimeSettingsFileMeta(): {
  path: string;
  exists: boolean;
  bytes: number | null;
  mtimeMs: number | null;
} {
  const path = getRuntimeSettingsFilePath();
  try {
    const st = fs.statSync(path);
    return { path, exists: true, bytes: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return { path, exists: false, bytes: null, mtimeMs: null };
  }
}

function trendDirSnapshot(): { dir: string; exists: boolean; reportFileCount: number } {
  const dir = getEffectiveTrendOutputDir();
  try {
    if (!fs.existsSync(dir)) return { dir, exists: false, reportFileCount: 0 };
    const n = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("report_") && f.endsWith(".json")).length;
    return { dir, exists: true, reportFileCount: n };
  } catch {
    return { dir, exists: false, reportFileCount: 0 };
  }
}

/** 对外 HTTP 路由清单（由 `buildBffHttpRouteCatalog()` 生成，与 H1 注册表一致） */
export const HTTP_ROUTE_CATALOG = buildBffHttpRouteCatalog();

export { ADMIN_OPS_API_DOCS } from "./admin-api-catalog";

/**
 * 聚合只读诊断：进程、包版本、CLI、趋势目录、运行时文件、HTTP 常量、功能开关、路由表。
 * 不含任何 API Key / 密钥原文。
 */
export function adminDiagnosticsPayload(): Record<string, unknown> {
  const m = process.memoryUsage();
  const pkg = readPackageBrief();
  const sandboxes = listCliSandboxes();
  return {
    ok: true,
    buildRevision: (process.env.HWALLET_BUILD_REVISION || "").trim() || null,
    package: pkg,
    process: {
      cwd: process.cwd(),
      argv0: process.argv0,
      cpuCount: os.cpus().length,
      freemem: os.freemem(),
      totalmem: os.totalmem(),
    },
    memory: { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external },
    onchainos: {
      available: isOnchainosCliAvailable(),
      versionLine: onchainosVersionLine(),
    },
    cliHome: {
      root: CLI_HOME_ROOT,
      sandboxCount: sandboxes.length,
    },
    trend: trendDirSnapshot(),
    runtimeSettingsFile: runtimeSettingsFileMeta(),
    httpTimeouts: {
      externalLlmFetchMs: {
        envBaseline: getExternalLlmFetchTimeoutEnvBaseline(),
        effective: getEffectiveExternalLlmFetchTimeoutMs(),
      },
      constants: {
        FETCH_TIMEOUT_MS,
        OTP_POST_DEADLINE_MS,
        OKX_AGENTIC_FETCH_TIMEOUT_MS,
      },
    },
    featureFlags: {
      metaCapabilitiesEnforced: Boolean(META_CAPABILITIES_TOKEN),
      okxProjectIdConfigured: Boolean(String(OKX_PROJECT_ID || "").trim()),
      okxApiKeyConfigured: Boolean(OKX_API_KEY && OKX_SECRET_KEY),
    },
    routeCatalog: HTTP_ROUTE_CATALOG,
  };
}
