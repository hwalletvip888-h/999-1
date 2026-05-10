/** MCP → BFF 出站请求默认超时（毫秒）；可用 HWALLET_MCP_FETCH_TIMEOUT_MS 覆盖，clamp 10s–120s */

function clampMs(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

const _mcp = parseInt(process.env.HWALLET_MCP_FETCH_TIMEOUT_MS || "28000", 10);
const DEFAULT_FETCH_MS = clampMs(_mcp, 10_000, 120_000);

function mergedTimeoutSignal(user: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs);
  if (!user) return t;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([user, t]);
  }
  return t;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_MS,
): Promise<Response> {
  const signal = mergedTimeoutSignal(init.signal ?? undefined, timeoutMs);
  return fetch(url, { ...init, signal });
}
