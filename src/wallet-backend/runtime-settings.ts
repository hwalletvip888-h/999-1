/**
 * 工作台运行时参数：JSON 持久化 + 内存缓存，覆盖 env 默认值（无需重启进程）。
 * 路径：HWALLET_RUNTIME_SETTINGS_PATH，否则 CLI_HOME_ROOT/runtime-settings.json
 */
import * as fs from "fs";
import * as nodePath from "path";
import { z } from "zod";
import {
  AI_RATE_LIMIT_MAX,
  AI_RATE_LIMIT_WINDOW_MS,
  CLI_HOME_ROOT,
  CORS_ALLOWED_ORIGINS,
  MAX_JSON_BODY_BYTES,
} from "./config";
import { ensureCliHomeRoot } from "./cli-home";

export type RuntimeOverridesStored = {
  aiRateLimitMax?: number;
  aiRateLimitWindowMs?: number;
  maxJsonBodyBytes?: number;
  corsAllowedOrigins?: string;
  trendOutputDir?: string;
  updatedAt?: string;
};

/** 磁盘文件允许未知字段（忽略），避免旧版本写入的键导致整文件失效 */
const storedShape = z.object({
  aiRateLimitMax: z.number().finite().optional(),
  aiRateLimitWindowMs: z.number().finite().optional(),
  maxJsonBodyBytes: z.number().finite().optional(),
  corsAllowedOrigins: z.string().optional(),
  trendOutputDir: z.string().optional(),
  updatedAt: z.string().optional(),
});

const patchSchema = z
  .object({
    aiRateLimitMax: z.union([z.number().finite(), z.null()]).optional(),
    aiRateLimitWindowMs: z.union([z.number().finite(), z.null()]).optional(),
    maxJsonBodyBytes: z.union([z.number().finite(), z.null()]).optional(),
    corsAllowedOrigins: z.union([z.string(), z.null()]).optional(),
    trendOutputDir: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

let cachedOverrides: RuntimeOverridesStored | null = null;

export function getRuntimeSettingsFilePath(): string {
  const fromEnv = (process.env.HWALLET_RUNTIME_SETTINGS_PATH || "").trim();
  if (fromEnv) return fromEnv;
  return nodePath.join(CLI_HOME_ROOT, "runtime-settings.json");
}

function parseStored(raw: unknown): RuntimeOverridesStored {
  const p = storedShape.safeParse(raw);
  if (!p.success) return {};
  const { updatedAt: _u, ...rest } = p.data;
  return rest;
}

function loadOverridesFromDisk(): RuntimeOverridesStored {
  ensureCliHomeRoot();
  const p = getRuntimeSettingsFilePath();
  try {
    const text = fs.readFileSync(p, "utf8");
    const j = JSON.parse(text) as unknown;
    return parseStored(j);
  } catch {
    return {};
  }
}

export function getRuntimeOverrides(): RuntimeOverridesStored {
  if (cachedOverrides === null) {
    cachedOverrides = loadOverridesFromDisk();
  }
  return cachedOverrides;
}

export function invalidateRuntimeSettingsCache(): void {
  cachedOverrides = null;
}

function defaultTrendDirFromEnv(): string {
  const fromEnv = (process.env.HWALLET_TREND_OUTPUT_DIR || "").trim();
  if (fromEnv) return fromEnv;
  return nodePath.join(process.env.HOME || "/root", "trend_engine/output");
}

export function getEffectiveAiRateLimitMax(): number {
  const o = getRuntimeOverrides().aiRateLimitMax;
  if (typeof o === "number" && Number.isFinite(o)) return Math.floor(o);
  return AI_RATE_LIMIT_MAX;
}

export function getEffectiveAiRateLimitWindowMs(): number {
  const o = getRuntimeOverrides().aiRateLimitWindowMs;
  if (typeof o === "number" && Number.isFinite(o)) return Math.floor(o);
  return AI_RATE_LIMIT_WINDOW_MS;
}

export function getEffectiveMaxJsonBodyBytes(): number {
  const o = getRuntimeOverrides().maxJsonBodyBytes;
  if (typeof o === "number" && Number.isFinite(o)) return Math.floor(o);
  return MAX_JSON_BODY_BYTES;
}

export function getEffectiveCorsAllowedOrigins(): string {
  const o = getRuntimeOverrides().corsAllowedOrigins;
  if (typeof o === "string" && o.trim()) return o.trim();
  return CORS_ALLOWED_ORIGINS;
}

export function getEffectiveTrendOutputDir(): string {
  const o = getRuntimeOverrides().trendOutputDir;
  if (typeof o === "string" && o.trim()) return o.trim();
  return defaultTrendDirFromEnv();
}

export type RuntimeSettingsPayload = {
  ok: true;
  filePath: string;
  overrides: RuntimeOverridesStored;
  envBaseline: {
    aiRateLimitMax: number;
    aiRateLimitWindowMs: number;
    maxJsonBodyBytes: number;
    corsAllowedOrigins: string;
    trendOutputDir: string;
  };
  effective: {
    aiRateLimitMax: number;
    aiRateLimitWindowMs: number;
    maxJsonBodyBytes: number;
    corsAllowedOrigins: string;
    trendOutputDir: string;
  };
};

export function buildRuntimeSettingsPayload(): RuntimeSettingsPayload {
  const overrides = { ...getRuntimeOverrides() };
  delete (overrides as { updatedAt?: string }).updatedAt;
  return {
    ok: true,
    filePath: getRuntimeSettingsFilePath(),
    overrides,
    envBaseline: {
      aiRateLimitMax: AI_RATE_LIMIT_MAX,
      aiRateLimitWindowMs: AI_RATE_LIMIT_WINDOW_MS,
      maxJsonBodyBytes: MAX_JSON_BODY_BYTES,
      corsAllowedOrigins: CORS_ALLOWED_ORIGINS,
      trendOutputDir: defaultTrendDirFromEnv(),
    },
    effective: {
      aiRateLimitMax: getEffectiveAiRateLimitMax(),
      aiRateLimitWindowMs: getEffectiveAiRateLimitWindowMs(),
      maxJsonBodyBytes: getEffectiveMaxJsonBodyBytes(),
      corsAllowedOrigins: getEffectiveCorsAllowedOrigins(),
      trendOutputDir: getEffectiveTrendOutputDir(),
    },
  };
}

function clampInt(n: number, min: number, max: number): number {
  const x = Math.floor(n);
  return Math.min(max, Math.max(min, x));
}

function validatePatchNumbers(patch: Record<string, unknown>): string | null {
  if ("aiRateLimitMax" in patch && patch.aiRateLimitMax !== null) {
    const v = Number(patch.aiRateLimitMax);
    if (!Number.isFinite(v) || v < 0 || v > 100_000) return "aiRateLimitMax 须在 0～100000";
  }
  if ("aiRateLimitWindowMs" in patch && patch.aiRateLimitWindowMs !== null) {
    const v = Number(patch.aiRateLimitWindowMs);
    if (!Number.isFinite(v) || v < 1_000 || v > 86_400_000) return "aiRateLimitWindowMs 须在 1000～86400000";
  }
  if ("maxJsonBodyBytes" in patch && patch.maxJsonBodyBytes !== null) {
    const v = Number(patch.maxJsonBodyBytes);
    if (!Number.isFinite(v) || v < 1024 || v > 10 * 1024 * 1024) return "maxJsonBodyBytes 须在 1024～10485760";
  }
  if ("corsAllowedOrigins" in patch && patch.corsAllowedOrigins !== null) {
    const s = String(patch.corsAllowedOrigins);
    if (s.length > 2048) return "corsAllowedOrigins 过长";
  }
  if ("trendOutputDir" in patch && patch.trendOutputDir !== null) {
    const s = String(patch.trendOutputDir).trim();
    if (s.length === 0) return "trendOutputDir 不能为空";
    if (s.length > 512) return "trendOutputDir 过长";
    if (s.includes("\0")) return "trendOutputDir 含非法字符";
  }
  return null;
}

/**
 * 合并 patch 写入磁盘；null 表示清除该键的覆盖（回退 env）。
 * 返回合并后的 effective 视图或校验错误文案。
 */
export function applyRuntimeSettingsPatch(
  body: unknown,
): { ok: true; payload: RuntimeSettingsPayload } | { ok: false; error: string } {
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "请求体格式无效: " + parsed.error.message };
  }
  const patch = parsed.data as Record<string, unknown>;
  const verr = validatePatchNumbers(patch);
  if (verr) return { ok: false, error: verr };

  const cur = { ...getRuntimeOverrides() };
  for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
    const v = patch[key];
    if (v === undefined) continue;
    if (v === null) {
      delete (cur as any)[key];
    } else if (key === "aiRateLimitMax") {
      cur.aiRateLimitMax = clampInt(v as number, 0, 100_000);
    } else if (key === "aiRateLimitWindowMs") {
      cur.aiRateLimitWindowMs = clampInt(v as number, 1_000, 86_400_000);
    } else if (key === "maxJsonBodyBytes") {
      cur.maxJsonBodyBytes = clampInt(v as number, 1024, 10 * 1024 * 1024);
    } else if (key === "corsAllowedOrigins") {
      cur.corsAllowedOrigins = String(v).trim();
    } else if (key === "trendOutputDir") {
      cur.trendOutputDir = String(v).trim();
    }
  }

  cur.updatedAt = new Date().toISOString();

  const persist: RuntimeOverridesStored = {};
  if (typeof cur.aiRateLimitMax === "number") persist.aiRateLimitMax = cur.aiRateLimitMax;
  if (typeof cur.aiRateLimitWindowMs === "number") persist.aiRateLimitWindowMs = cur.aiRateLimitWindowMs;
  if (typeof cur.maxJsonBodyBytes === "number") persist.maxJsonBodyBytes = cur.maxJsonBodyBytes;
  if (typeof cur.corsAllowedOrigins === "string" && cur.corsAllowedOrigins)
    persist.corsAllowedOrigins = cur.corsAllowedOrigins;
  if (typeof cur.trendOutputDir === "string" && cur.trendOutputDir) persist.trendOutputDir = cur.trendOutputDir;
  persist.updatedAt = cur.updatedAt;

  ensureCliHomeRoot();
  const fp = getRuntimeSettingsFilePath();
  fs.writeFileSync(fp, JSON.stringify(persist, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });

  cachedOverrides = parseStored(persist);
  return { ok: true, payload: buildRuntimeSettingsPayload() };
}
