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

/** 运维台 Admin API 文档行（与 `admin-routes` 同步，供 `/ops` 页面生成器注入） */
export const ADMIN_OPS_API_DOCS: { path: string; note: string }[] = [
  { path: "/api/admin/ping", note: "校验密钥" },
  { path: "/api/admin/overview", note: "健康、沙箱列表、脱敏配置" },
  { path: "/api/admin/system", note: "进程 uptime、Node 版本、内存" },
  { path: "/api/admin/trend-status", note: "趋势磁盘报告摘要（无则 hasReport:false）" },
  { path: "/api/admin/ai-limits", note: "AI 限流窗口与当前桶数量" },
  { path: "/api/admin/diagnostics", note: "聚合只读诊断（进程、路由表、HTTP 常量等）" },
  { path: "/api/admin/settings", note: "GET：运行时参数；POST：JSON 合并写入（见 ops-console/README）" },
];

/** 只读：对外 HTTP 路由清单（与 diagnostics.routeCatalog 同源） */
export const HTTP_ROUTE_CATALOG: { method: string; path: string; note: string }[] = [
  { method: "GET", path: "/health", note: "健康检查 JSON" },
  { method: "GET", path: "/ops", note: "运维操作页（本页，服务端生成 HTML）" },
  { method: "GET", path: "/api/meta/capabilities", note: "能力发现；可配置 X-Hwallet-Meta-Token" },
  { method: "GET", path: "/api/trend", note: "趋势摘要（磁盘 report）" },
  { method: "GET", path: "/api/admin/*", note: "运维 Admin（X-Ops-Key）" },
  { method: "POST", path: "/api/auth/send-otp", note: "发送 OTP（别名 /api/agent-wallet/send-code）" },
  { method: "POST", path: "/api/auth/verify-otp", note: "校验 OTP（别名 /api/agent-wallet/verify）" },
  { method: "GET", path: "/api/wallet/addresses", note: "地址（别名 /api/agent-wallet/addresses）" },
  { method: "GET", path: "/api/wallet/accounts", note: "账户列表" },
  { method: "POST", path: "/api/wallet/accounts/switch", note: "切换账户" },
  { method: "POST", path: "/api/wallet/accounts/add", note: "添加账户" },
  {
    method: "GET",
    path: "/api/v6/wallet/portfolio",
    note: "资产组合（别名 /api/agent-wallet/balance、/api/wallet/balance）",
  },
  { method: "POST", path: "/api/v6/wallet/send", note: "发送交易" },
  { method: "POST", path: "/api/v6/dex/swap-quote", note: "DEX 询价" },
  { method: "POST", path: "/api/v6/dex/swap-execute", note: "DEX 执行" },
  { method: "POST", path: "/api/ai/chat", note: "闲聊（DeepSeek）" },
  { method: "POST", path: "/api/ai/intent", note: "意图（Claude / fallback）" },
];

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
