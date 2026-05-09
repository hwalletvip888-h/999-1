import { hwalletAbsoluteUrl } from "../../../../services/walletApiCore";
import { fetchWithTimeout } from "../../../../services/walletApiHttp";
import { HwalletHttpError } from "../../../../services/hwalletHttpError";
import { DEFAULT_GET_MAX_RETRIES, withHttpRetries } from "../../../../services/walletHttpRetry";

export type CallBackendOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string;
  builderCode?: string;
  /** 与内置超时合并；页面卸载等场景可传入以取消请求 */
  signal?: AbortSignal;
  /**
   * 是否对 GET 在 429/502/503/504 与网络失败时做有限次重试。POST 为安全起见默认不重试。
   * @default true（仅 GET 生效）
   */
  retry?: boolean;
};

export async function callBackend<T>(path: string, options: CallBackendOptions = {}): Promise<T> {
  const url = hwalletAbsoluteUrl(path);
  if (!url) {
    throw new HwalletHttpError("EXPO_PUBLIC_HWALLET_API_BASE 未配置", -1, path);
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.builderCode) headers["x-builder-code"] = options.builderCode;

  const method = options.method ?? "GET";
  const doFetch = () =>
    fetchWithTimeout(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

  let res: Response;
  try {
    const wantRetry = options.retry !== false && method === "GET";
    res = wantRetry
      ? await withHttpRetries(doFetch, { method, maxRetries: DEFAULT_GET_MAX_RETRIES })
      : await doFetch();
  } catch (e: unknown) {
    const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
    if (name === "AbortError") {
      throw new HwalletHttpError("请求已取消或连接超时", 0, path, String((e as Error)?.message ?? ""));
    }
    throw new HwalletHttpError("网络异常", 0, path, String((e as Error)?.message ?? ""));
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const backendErr =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error?: unknown }).error ?? "").trim()
        : "";
    const detail =
      backendErr ||
      (typeof json === "object" && json !== null && "message" in json
        ? String((json as { message?: unknown }).message ?? "").trim()
        : "") ||
      (text.trim().slice(0, 240) || `HTTP ${res.status}`);
    throw new HwalletHttpError(`[okxOnchainClient] HTTP ${res.status} on ${path}: ${detail}`, res.status, path, detail);
  }
  return json as T;
}
