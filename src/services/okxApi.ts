/**
 * okxApi.ts —— OKX REST 客户端（只读为主）
 *
 * 设计原则：
 *  - 公共接口（行情）不需要 key
 *  - 私有接口（账户余额、持仓）签名后调用
 *  - 不暴露下单方法 —— 真实下单走 LiveAgentRunner，单独再开
 *  - 失败时 throw OkxApiError，调用方 try/catch
 *
 * 传输 / 签名 / 超时与 `api/providers/okx/okxHttpCore` 对齐，避免重复 HMAC 实现。
 */

import { request as okxCoreRequest, OkxApiError, type OkxCredentials as CoreCreds } from "../api/providers/okx/okxHttpCore";
import { loadOkxCredentials, type OkxCredentials } from "../config/okx";

export { OkxApiError } from "../api/providers/okx/okxHttpCore";

function toCoreCreds(c: OkxCredentials): CoreCreds {
  return {
    apiKey: c.apiKey,
    secretKey: c.apiSecret,
    passphrase: c.passphrase,
    simulated: c.simulated,
  };
}

type Method = "GET" | "POST";

async function requestData<T = unknown>(
  method: Method,
  path: string,
  body?: Record<string, unknown>,
  creds?: OkxCredentials | null,
  signal?: AbortSignal,
): Promise<T> {
  const coreCreds = creds ? toCoreCreds(creds) : null;
  const postBody =
    method === "POST" && body !== undefined ? (body as Record<string, any>) : undefined;
  const json = await okxCoreRequest<T>(method, path, coreCreds, postBody, { signal });
  if (json && json.code !== "0") {
    throw new OkxApiError(json.msg || "okx api error", json.code);
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
  const data = await requestData<OkxTicker[]>(
    "GET",
    `/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`,
  );
  return Array.isArray(data) ? (data[0] ?? null) : null;
}

export type OkxBar = "1m" | "3m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D" | "1W";

/**
 * OKX K 线返回 [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm] 字符串数组
 */
export async function getCandles(
  instId: string,
  bar: OkxBar = "1m",
  limit = 100,
): Promise<{ t: number; o: number; h: number; l: number; c: number; v: number }[]> {
  const raw = await requestData<string[][]>(
    "GET",
    `/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${limit}`,
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
      v: parseFloat(row[5]),
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
  const data = await requestData<{ details: OkxBalanceItem[] }[]>(
    "GET",
    "/api/v5/account/balance",
    undefined,
    creds,
  );
  return data?.[0]?.details ?? [];
}

export async function getServerTime(): Promise<number> {
  const data = await requestData<{ ts: string }[]>("GET", "/api/v5/public/time");
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
