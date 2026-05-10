/**
 * 任意 URL 的 fetch + 超时（与 `mergeUserSignalWithTimeout` 合并用户 AbortSignal）。
 * 用于 Claude / DeepSeek 等非 H Wallet 后端的出站请求。
 */
import { mergeUserSignalWithTimeout } from "./mergeUserSignalWithTimeout";

export async function fetchWithDeadline(
  url: string,
  init: RequestInit,
  timeoutMs: number,
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
