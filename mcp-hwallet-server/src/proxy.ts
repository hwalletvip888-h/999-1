import type { CapabilityToolMeta } from "./capabilities.js";

const META_KEYS = new Set(["hwallet_session", "hwallet_idempotency_key", "hwallet_request_id"]);

function stripMetaArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (META_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export type ProxyResult =
  | { ok: true; status: number; body: string; contentType: string }
  | { ok: false; message: string };

/**
 * 将 MCP 工具调用转发到 H Wallet BFF
 */
export async function proxyToBff(
  apiBase: string,
  meta: CapabilityToolMeta,
  args: Record<string, unknown>,
): Promise<ProxyResult> {
  const base = apiBase.replace(/\/$/, "");
  const url = `${base}${meta.path}`;

  const sessionRaw = args.hwallet_session ?? process.env.HWALLET_SESSION_TOKEN;
  const session = typeof sessionRaw === "string" ? sessionRaw : "";

  if (meta.requiresSession && !session.trim()) {
    return {
      ok: false,
      message:
        "此工具需要会话：请在参数中传入 hwallet_session（Bearer token 串，可不带前缀），或设置环境变量 HWALLET_SESSION_TOKEN。",
    };
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (session) {
    headers.Authorization = session.startsWith("Bearer ") ? session : `Bearer ${session}`;
  }

  const idem = args.hwallet_idempotency_key;
  if (meta.write && typeof idem === "string" && idem.trim()) {
    headers["Idempotency-Key"] = idem.trim();
  }

  const rid = args.hwallet_request_id;
  if (typeof rid === "string" && rid.trim()) {
    headers["X-Request-Id"] = rid.trim();
  }

  const payload = stripMetaArgs(args);
  const method = meta.method.toUpperCase();

  try {
    if (method === "GET") {
      const res = await fetch(url, { method: "GET", headers });
      const text = await res.text();
      return {
        ok: true,
        status: res.status,
        body: text,
        contentType: res.headers.get("content-type") || "application/json",
      };
    }

    headers["Content-Type"] = "application/json";
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    return {
      ok: true,
      status: res.status,
      body: text,
      contentType: res.headers.get("content-type") || "application/json",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Fetch error: ${msg}` };
  }
}
