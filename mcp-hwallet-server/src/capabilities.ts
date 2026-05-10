/** 与 BFF `GET /api/meta/capabilities` 响应对齐 */

import { fetchWithTimeout } from "./fetch-timeout.js";

export type CapabilityToolMeta = {
  method: string;
  path: string;
  pathAliases?: string[];
  requiresSession: boolean;
  write?: boolean;
};

export type CapabilityTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  _meta: CapabilityToolMeta;
};

export type CapabilitiesResponse = {
  ok: boolean;
  schemaVersion: string;
  tools: CapabilityTool[];
};

export type FetchCapabilitiesOptions = {
  /** 连接失败或非 2xx 时的重试次数（不含首次） */
  retries?: number;
  delayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchCapabilities(
  apiBase: string,
  opts?: FetchCapabilitiesOptions,
): Promise<CapabilityTool[]> {
  const retries = opts?.retries ?? 5;
  const delayMs = opts?.delayMs ?? 1000;
  const base = apiBase.replace(/\/$/, "");
  const url = `${base}/api/meta/capabilities`;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      const meta = process.env.HWALLET_META_CAPABILITIES_TOKEN?.trim();
      if (meta) {
        headers["X-Hwallet-Meta-Token"] = meta;
      }
      const res = await fetchWithTimeout(url, { headers });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`GET /api/meta/capabilities failed: ${res.status} ${t.slice(0, 500)}`);
      }
      const data = (await res.json()) as CapabilitiesResponse;
      if (!data.ok || !Array.isArray(data.tools)) {
        throw new Error("Invalid capabilities JSON: expected { ok: true, tools: [...] }");
      }
      return data.tools;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await sleep(delayMs);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
