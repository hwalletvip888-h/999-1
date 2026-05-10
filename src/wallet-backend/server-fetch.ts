import { mergeUserSignalWithTimeout } from "../services/mergeUserSignalWithTimeout";

const DEFAULT_SERVER_FETCH_MS = 30_000;

/** wallet-backend 进程内出站请求：统一超时 + 与用户 AbortSignal 合并 */
export async function fetchWithServerTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_SERVER_FETCH_MS,
): Promise<Response> {
  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = mergeUserSignalWithTimeout(init.signal ?? undefined, timeoutController.signal);
  try {
    return await fetch(url, { ...init, signal });
  } finally {
    clearTimeout(t);
  }
}
