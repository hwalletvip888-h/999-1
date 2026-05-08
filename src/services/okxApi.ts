/**
 * okxApi.ts —— OKX REST 客户端（只读为主）
 *
 * 设计原则：
 *  - 公共接口（行情）不需要 key
 *  - 私有接口（账户余额、持仓）签名后调用
 *  - 不暴露下单方法 —— 真实下单走 LiveAgentRunner，单独再开
 *  - 失败时 throw OkxApiError，调用方 try/catch
 */

import { sha256 } from "js-sha256";
import { loadOkxCredentials, type OkxCredentials } from "../config/okx";

const REST_BASE = "https://www.okx.com";

export class OkxApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "OkxApiError";
  }
}

/* ─── HMAC-SHA256 → base64 (OKX 要求) ─── */
function hmacBase64(secret: string, msg: string): string {
  // js-sha256 提供 hmac.array 返回 byte 数组
  const bytes = sha256.hmac.array(secret, msg);
  // RN Hermes 没有 Buffer，自己 base64
  return bytesToBase64(new Uint8Array(bytes));
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + B64[((b & 15) << 2) | (c >> 6)] + B64[c & 63];
  }
  if (i < bytes.length) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[(b & 15) << 2] : "=";
    out += "=";
  }
  return out;
}

/* ─── 通用请求 ─── */
type Method = "GET" | "POST";

async function request<T = unknown>(
  method: Method,
  path: string, // e.g. /api/v5/market/ticker?instId=BTC-USDT
  body?: unknown,
  creds?: OkxCredentials | null
): Promise<T> {
  const url = REST_BASE + path;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  // 私有接口：附加签名头
  if (creds) {
    const ts = new Date().toISOString();
    const bodyStr = body ? JSON.stringify(body) : "";
    const prehash = ts + method + path + bodyStr;
    const sign = hmacBase64(creds.secretKey, prehash);
    headers["OK-ACCESS-KEY"] = creds.apiKey;
    headers["OK-ACCESS-SIGN"] = sign;
    headers["OK-ACCESS-TIMESTAMP"] = ts;
    headers["OK-ACCESS-PASSPHRASE"] = creds.passphrase;
    if (creds.simulated) headers["x-simulated-trading"] = "1";
  }

  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      headers,
      body: method === "POST" && body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    throw new OkxApiError(`network error: ${(e as Error).message}`);
  }

  let json: any;
  try {
    json = await resp.json();
  } catch {
    throw new OkxApiError(`invalid json (status ${resp.status})`, undefined, resp.status);
  }

  if (json && json.code !== "0") {
    throw new OkxApiError(json.msg || "okx api error", json.code, resp.status);
  }
  return (json?.data ?? json) as T;
}

/* ─── 公共接口（无需 key） ─── */

export type OkxTicker = {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  ts: string;
};

export async function getTicker(instId: string): Promise<OkxTicker | null> {
  const data = await request<OkxTicker[]>("GET", `/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`);
  return Array.isArray(data) ? data[0] ?? null : null;
}

export type OkxBar = "1m" | "3m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D" | "1W";

/**
 * OKX K 线返回 [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm] 字符串数组
 */
export async function getCandles(
  instId: string,
  bar: OkxBar = "1m",
  limit = 100
): Promise<{ t: number; o: number; h: number; l: number; c: number; v: number }[]> {
  const raw = await request<string[][]>(
    "GET",
    `/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${limit}`
  );
  // OKX 返回是新→旧，反转一下方便绘图
  return raw
    .slice()
    .reverse()
    .map((row) => ({
      t: Math.floor(parseInt(row[0], 10) / 1000),
      o: parseFloat(row[1]),
      h: parseFloat(row[2]),
      l: parseFloat(row[3]),
      c: parseFloat(row[4]),
      v: parseFloat(row[5])
    }));
}

/* ─── 私有接口（需 key） ─── */

export type OkxBalanceItem = {
  ccy: string;
  bal: string;
  availBal: string;
  eqUsd?: string;
};

export async function getAccountBalance(): Promise<OkxBalanceItem[]> {
  const creds = loadOkxCredentials();
  if (!creds) throw new OkxApiError("OKX credentials not configured");
  // 资产账户余额
  const data = await request<{ details: OkxBalanceItem[] }[]>(
    "GET",
    "/api/v5/account/balance",
    undefined,
    creds
  );
  return data?.[0]?.details ?? [];
}

export async function getServerTime(): Promise<number> {
  const data = await request<{ ts: string }[]>("GET", "/api/v5/public/time");
  return parseInt(data?.[0]?.ts ?? "0", 10);
}

/** 健康检查：能成功签名 + 拉到余额返回 true */
export async function pingOkxAuth(): Promise<{ ok: boolean; detail: string }> {
  try {
    const list = await getAccountBalance();
    return { ok: true, detail: `已连接 OKX · ${list.length} 个币种余额` };
  } catch (e) {
    const err = e as OkxApiError;
    return { ok: false, detail: `${err.code ?? ""} ${err.message}`.trim() };
  }
}
