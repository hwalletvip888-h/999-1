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
  /** 与 `HWALLET_CLAUDE_INTENT_MODEL` 一致，Anthropic model id */
  claudeIntentModel?: string;
  /** 与 `HWALLET_DEEPSEEK_CHAT_MODEL` 一致 */
  deepseekChatModel?: string;
  /** 与 `HWALLET_DEEPSEEK_INTENT_MODEL` 一致；未覆盖时回退 env 再回退闲聊模型 */
  deepseekIntentModel?: string;
  /** 与 `HWALLET_DEEPSEEK_CHAT_MAX_TOKENS` 一致（256–8192） */
  deepseekChatMaxTokens?: number;
  /** 与 `HWALLET_INTENT_MAX_TOKENS` 一致（128–4096） */
  intentMaxTokens?: number;
  /** 与 `HWALLET_EXTERNAL_LLM_FETCH_TIMEOUT_MS` 一致（30s–300s，毫秒） */
  externalLlmFetchTimeoutMs?: number;
  updatedAt?: string;
};

/** 磁盘文件允许未知字段（忽略），避免旧版本写入的键导致整文件失效 */
const storedShape = z.object({
  aiRateLimitMax: z.number().finite().optional(),
  aiRateLimitWindowMs: z.number().finite().optional(),
  maxJsonBodyBytes: z.number().finite().optional(),
  corsAllowedOrigins: z.string().optional(),
  trendOutputDir: z.string().optional(),
  claudeIntentModel: z.string().optional(),
  deepseekChatModel: z.string().optional(),
  deepseekIntentModel: z.string().optional(),
  deepseekChatMaxTokens: z.number().finite().optional(),
  intentMaxTokens: z.number().finite().optional(),
  externalLlmFetchTimeoutMs: z.number().finite().optional(),
  updatedAt: z.string().optional(),
});

const patchSchema = z
  .object({
    aiRateLimitMax: z.union([z.number().finite(), z.null()]).optional(),
    aiRateLimitWindowMs: z.union([z.number().finite(), z.null()]).optional(),
    maxJsonBodyBytes: z.union([z.number().finite(), z.null()]).optional(),
    corsAllowedOrigins: z.union([z.string(), z.null()]).optional(),
    trendOutputDir: z.union([z.string(), z.null()]).optional(),
    claudeIntentModel: z.union([z.string(), z.null()]).optional(),
    deepseekChatModel: z.union([z.string(), z.null()]).optional(),
    deepseekIntentModel: z.union([z.string(), z.null()]).optional(),
    deepseekChatMaxTokens: z.union([z.number().finite(), z.null()]).optional(),
    intentMaxTokens: z.union([z.number().finite(), z.null()]).optional(),
    externalLlmFetchTimeoutMs: z.union([z.number().finite(), z.null()]).optional(),
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

function clampInt(n: number, min: number, max: number): number {
  const x = Math.floor(n);
  return Math.min(max, Math.max(min, x));
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

function envClaudeIntentModel(): string {
  return (process.env.HWALLET_CLAUDE_INTENT_MODEL || "claude-sonnet-4-20250514").trim();
}

function envDeepseekChatModel(): string {
  return (process.env.HWALLET_DEEPSEEK_CHAT_MODEL || "deepseek-chat").trim();
}

/** env 意图模型；空则与闲聊模型 env 一致 */
function envDeepseekIntentModel(): string {
  return (process.env.HWALLET_DEEPSEEK_INTENT_MODEL || "").trim() || envDeepseekChatModel();
}

function envDeepseekChatMaxTokens(): number {
  const n = parseInt(process.env.HWALLET_DEEPSEEK_CHAT_MAX_TOKENS || "1024", 10);
  return clampInt(Number.isFinite(n) ? n : 1024, 256, 8192);
}

function envIntentMaxTokens(): number {
  const n = parseInt(process.env.HWALLET_INTENT_MAX_TOKENS || "512", 10);
  return clampInt(Number.isFinite(n) ? n : 512, 128, 4096);
}

function isSafeModelId(s: string): boolean {
  const t = s.trim();
  if (t.length < 1 || t.length > 160) return false;
  if (/[\x00-\x1f\x7f]/.test(t)) return false;
  return true;
}

export function getEffectiveClaudeIntentModel(): string {
  const o = getRuntimeOverrides().claudeIntentModel;
  if (typeof o === "string" && isSafeModelId(o)) return o.trim();
  return envClaudeIntentModel();
}

export function getEffectiveDeepseekChatModel(): string {
  const o = getRuntimeOverrides().deepseekChatModel;
  if (typeof o === "string" && isSafeModelId(o)) return o.trim();
  return envDeepseekChatModel();
}

export function getEffectiveDeepseekIntentModel(): string {
  const o = getRuntimeOverrides().deepseekIntentModel;
  if (typeof o === "string" && isSafeModelId(o)) return o.trim();
  return (process.env.HWALLET_DEEPSEEK_INTENT_MODEL || "").trim() || getEffectiveDeepseekChatModel();
}

export function getEffectiveDeepseekChatMaxTokens(): number {
  const o = getRuntimeOverrides().deepseekChatMaxTokens;
  if (typeof o === "number" && Number.isFinite(o)) return clampInt(Math.floor(o), 256, 8192);
  return envDeepseekChatMaxTokens();
}

export function getEffectiveIntentMaxTokens(): number {
  const o = getRuntimeOverrides().intentMaxTokens;
  if (typeof o === "number" && Number.isFinite(o)) return clampInt(Math.floor(o), 128, 4096);
  return envIntentMaxTokens();
}

/** 未应用 runtime 覆盖时，与 `hwalletHttpConstants.EXTERNAL_LLM_FETCH_TIMEOUT_MS` 同源 clamp */
export function getExternalLlmFetchTimeoutEnvBaseline(): number {
  const n = parseInt(process.env.HWALLET_EXTERNAL_LLM_FETCH_TIMEOUT_MS || "120000", 10);
  return Math.min(300_000, Math.max(30_000, Number.isFinite(n) ? n : 120_000));
}

export function getEffectiveExternalLlmFetchTimeoutMs(): number {
  const o = getRuntimeOverrides().externalLlmFetchTimeoutMs;
  if (typeof o === "number" && Number.isFinite(o)) return clampInt(Math.floor(o), 30_000, 300_000);
  return getExternalLlmFetchTimeoutEnvBaseline();
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
    claudeIntentModel: string;
    deepseekChatModel: string;
    deepseekIntentModel: string;
    deepseekChatMaxTokens: number;
    intentMaxTokens: number;
    externalLlmFetchTimeoutMs: number;
  };
  effective: {
    aiRateLimitMax: number;
    aiRateLimitWindowMs: number;
    maxJsonBodyBytes: number;
    corsAllowedOrigins: string;
    trendOutputDir: string;
    claudeIntentModel: string;
    deepseekChatModel: string;
    deepseekIntentModel: string;
    deepseekChatMaxTokens: number;
    intentMaxTokens: number;
    externalLlmFetchTimeoutMs: number;
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
      claudeIntentModel: envClaudeIntentModel(),
      deepseekChatModel: envDeepseekChatModel(),
      deepseekIntentModel: envDeepseekIntentModel(),
      deepseekChatMaxTokens: envDeepseekChatMaxTokens(),
      intentMaxTokens: envIntentMaxTokens(),
      externalLlmFetchTimeoutMs: getExternalLlmFetchTimeoutEnvBaseline(),
    },
    effective: {
      aiRateLimitMax: getEffectiveAiRateLimitMax(),
      aiRateLimitWindowMs: getEffectiveAiRateLimitWindowMs(),
      maxJsonBodyBytes: getEffectiveMaxJsonBodyBytes(),
      corsAllowedOrigins: getEffectiveCorsAllowedOrigins(),
      trendOutputDir: getEffectiveTrendOutputDir(),
      claudeIntentModel: getEffectiveClaudeIntentModel(),
      deepseekChatModel: getEffectiveDeepseekChatModel(),
      deepseekIntentModel: getEffectiveDeepseekIntentModel(),
      deepseekChatMaxTokens: getEffectiveDeepseekChatMaxTokens(),
      intentMaxTokens: getEffectiveIntentMaxTokens(),
      externalLlmFetchTimeoutMs: getEffectiveExternalLlmFetchTimeoutMs(),
    },
  };
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
  if ("claudeIntentModel" in patch && patch.claudeIntentModel !== null) {
    if (!isSafeModelId(String(patch.claudeIntentModel))) return "claudeIntentModel 格式无效";
  }
  if ("deepseekChatModel" in patch && patch.deepseekChatModel !== null) {
    if (!isSafeModelId(String(patch.deepseekChatModel))) return "deepseekChatModel 格式无效";
  }
  if ("deepseekIntentModel" in patch && patch.deepseekIntentModel !== null) {
    if (!isSafeModelId(String(patch.deepseekIntentModel))) return "deepseekIntentModel 格式无效";
  }
  if ("deepseekChatMaxTokens" in patch && patch.deepseekChatMaxTokens !== null) {
    const v = Number(patch.deepseekChatMaxTokens);
    if (!Number.isFinite(v) || v < 256 || v > 8192) return "deepseekChatMaxTokens 须在 256～8192";
  }
  if ("intentMaxTokens" in patch && patch.intentMaxTokens !== null) {
    const v = Number(patch.intentMaxTokens);
    if (!Number.isFinite(v) || v < 128 || v > 4096) return "intentMaxTokens 须在 128～4096";
  }
  if ("externalLlmFetchTimeoutMs" in patch && patch.externalLlmFetchTimeoutMs !== null) {
    const v = Number(patch.externalLlmFetchTimeoutMs);
    if (!Number.isFinite(v) || v < 30_000 || v > 300_000) return "externalLlmFetchTimeoutMs 须在 30000～300000";
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
    } else if (key === "claudeIntentModel") {
      cur.claudeIntentModel = String(v).trim();
    } else if (key === "deepseekChatModel") {
      cur.deepseekChatModel = String(v).trim();
    } else if (key === "deepseekIntentModel") {
      cur.deepseekIntentModel = String(v).trim();
    } else if (key === "deepseekChatMaxTokens") {
      cur.deepseekChatMaxTokens = clampInt(v as number, 256, 8192);
    } else if (key === "intentMaxTokens") {
      cur.intentMaxTokens = clampInt(v as number, 128, 4096);
    } else if (key === "externalLlmFetchTimeoutMs") {
      cur.externalLlmFetchTimeoutMs = clampInt(v as number, 30_000, 300_000);
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
  if (typeof cur.claudeIntentModel === "string" && cur.claudeIntentModel) persist.claudeIntentModel = cur.claudeIntentModel;
  if (typeof cur.deepseekChatModel === "string" && cur.deepseekChatModel) persist.deepseekChatModel = cur.deepseekChatModel;
  if (typeof cur.deepseekIntentModel === "string" && cur.deepseekIntentModel)
    persist.deepseekIntentModel = cur.deepseekIntentModel;
  if (typeof cur.deepseekChatMaxTokens === "number") persist.deepseekChatMaxTokens = cur.deepseekChatMaxTokens;
  if (typeof cur.intentMaxTokens === "number") persist.intentMaxTokens = cur.intentMaxTokens;
  if (typeof cur.externalLlmFetchTimeoutMs === "number") persist.externalLlmFetchTimeoutMs = cur.externalLlmFetchTimeoutMs;
  persist.updatedAt = cur.updatedAt;

  ensureCliHomeRoot();
  const fp = getRuntimeSettingsFilePath();
  fs.writeFileSync(fp, JSON.stringify(persist, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });

  cachedOverrides = parseStored(persist);
  return { ok: true, payload: buildRuntimeSettingsPayload() };
}
