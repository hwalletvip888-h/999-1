/**
 * 移动端 H Wallet 后端 HTTP 工具（超时、POST JSON）
 */
import { hwalletAbsoluteUrl } from "./walletApiCore";

export const FETCH_TIMEOUT_MS = 28_000;
export const OTP_POST_DEADLINE_MS = 32_000;

function withRequestId(init: RequestInit): RequestInit {
  const headers = new Headers(init.headers as HeadersInit | undefined);
  if (!headers.has("X-Request-Id")) {
    headers.set(
      "X-Request-Id",
      `hw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    );
  }
  return { ...init, headers };
}

export async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...withRequestId(init),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

export function raceOtpPost<T extends { ok: boolean; error?: string }>(p: Promise<T>): Promise<T> {
  const timeout: Promise<T> = new Promise((resolve) =>
    setTimeout(() => resolve({ ok: false, error: "请求超时，请检查网络后重试" } as T), OTP_POST_DEADLINE_MS),
  );
  return Promise.race([p, timeout]);
}

export async function postJson<T = any>(path: string, body: unknown): Promise<T> {
  const url = hwalletAbsoluteUrl(path);
  if (!url) {
    return { ok: false, error: "未配置 EXPO_PUBLIC_HWALLET_API_BASE" } as T;
  }
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return {
        ok: false,
        error: res.ok ? "服务器响应格式异常" : `HTTP ${res.status}`,
      } as T;
    }
    return data as T;
  } catch (e: unknown) {
    const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
    if (name === "AbortError") {
      return { ok: false, error: "连接超时，请检查网络或服务是否可达" } as T;
    }
    return { ok: false, error: "网络异常，请稍后重试" } as T;
  }
}
