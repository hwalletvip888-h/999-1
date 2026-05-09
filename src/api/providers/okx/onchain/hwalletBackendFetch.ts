import { getHwalletApiBase } from "../../../../services/walletApiCore";

export async function callBackend<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: any; token?: string; builderCode?: string } = {},
): Promise<T> {
  const base = getHwalletApiBase();
  if (!base) {
    throw new Error("EXPO_PUBLIC_HWALLET_API_BASE 未配置");
  }
  const url = `${base}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.builderCode) headers["x-builder-code"] = options.builderCode;
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
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
    throw new Error(`[okxOnchainClient] HTTP ${res.status} on ${path}: ${detail}`);
  }
  return json as T;
}
