/** MCP → BFF 出站请求默认超时（毫秒） */
const DEFAULT_FETCH_MS = 28_000;

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
