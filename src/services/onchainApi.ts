/**
 * onchainApi.ts — OKX Onchain OS HTTP Client (React Native 兼容)
 *
 * 直接调用 OKX Web3 DEX/Token API，不依赖 onchainos CLI。
 * 使用 HMAC-SHA256 签名（与 V5 相同机制，但走不同的 base URL）。
 *
 * API 文档参考:
 *   - Token: https://www.okx.com/web3/build/docs/waas/dex-get-token-list
 *   - DEX Swap: https://www.okx.com/web3/build/docs/waas/dex-swap
 *   - Market: https://www.okx.com/web3/build/docs/waas/market-get-token-price
 */
import { sha256 } from "js-sha256";
import { loadOkxCredentials } from "../config/okx";

const WEB3_BASE = "https://www.okx.com";

// ─── HMAC Signing (same as okxApi.ts) ───────────────────────────────
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

function hmacBase64(secret: string, msg: string): string {
  const bytes = sha256.hmac.array(secret, msg);
  return bytesToBase64(new Uint8Array(bytes));
}

// ─── Request Helper ─────────────────────────────────────────────────
export class OnchainApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "OnchainApiError";
  }
}

async function web3Request<T = unknown>(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  const creds = loadOkxCredentials();
  if (!creds) throw new OnchainApiError("OKX credentials not configured");

  const url = WEB3_BASE + path;
  const ts = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const prehash = ts + method + path + bodyStr;
  const sign = hmacBase64(creds.apiSecret, prehash);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": creds.apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": ts,
    "OK-ACCESS-PASSPHRASE": creds.passphrase,
    "OK-ACCESS-PROJECT": creds.builderCode || "",
  };

  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      headers,
      body: method === "POST" && body ? bodyStr : undefined,
    });
  } catch (e) {
    throw new OnchainApiError(`network error: ${(e as Error).message}`);
  }

  let json: any;
  try {
    json = await resp.json();
  } catch {
    throw new OnchainApiError(`invalid json (status ${resp.status})`);
  }

  if (json?.code !== "0" && json?.code !== 0) {
    throw new OnchainApiError(json?.msg || json?.message || "web3 api error", String(json?.code));
  }

  return json?.data as T;
}

// ─── Token Hot List (Trending Meme Coins) ───────────────────────────
export type HotToken = {
  tokenSymbol: string;
  tokenContractAddress: string;
  chainIndex: string;
  price: string;
  change: string;
  volume: string;
  marketCap: string;
  liquidity: string;
  holders: string;
  txs: string;
  txsBuy: string;
  txsSell: string;
  uniqueTraders: string;
  top10HoldPercent: string;
  devHoldPercent: string;
  bundleHoldPercent: string;
  inflowUsd: string;
  riskLevelControl: string;
  tokenLogoUrl: string;
};

export async function getHotTokens(
  chainIndex: string = "501",
  options?: {
    rankingType?: string; // 4=Trending, 5=X mentions
    rankBy?: string;      // 5=volume, 6=marketCap
    timeFrame?: string;   // 4=24h
    limit?: number;
  }
): Promise<HotToken[]> {
  const params = new URLSearchParams();
  params.set("chainIndex", chainIndex);
  if (options?.rankingType) params.set("rankingType", options.rankingType);
  if (options?.rankBy) params.set("orderBy", options.rankBy);
  if (options?.timeFrame) params.set("period", options.timeFrame);
  if (options?.limit) params.set("limit", String(options.limit));

  const path = `/api/v5/dex/market/hot-token?${params.toString()}`;
  return web3Request<HotToken[]>("GET", path);
}

// ─── Token Price Info ───────────────────────────────────────────────
export type TokenPriceInfo = {
  tokenSymbol: string;
  tokenContractAddress: string;
  price: string;
  priceChange24h: string;
  volume24h: string;
  marketCap: string;
  liquidity: string;
  holders: string;
};

export async function getTokenPriceInfo(
  chainIndex: string,
  tokenAddress: string
): Promise<TokenPriceInfo | null> {
  const path = `/api/v5/dex/market/token-price-info?chainIndex=${chainIndex}&tokenContractAddress=${encodeURIComponent(tokenAddress)}`;
  const data = await web3Request<TokenPriceInfo[]>("GET", path);
  return Array.isArray(data) ? data[0] ?? null : null;
}

// ─── Token Security Scan ────────────────────────────────────────────
export type TokenSecurityInfo = {
  isHoneypot: boolean;
  isMintable: boolean;
  isOpenSource: boolean;
  riskLevel: string;
  buyTax: string;
  sellTax: string;
};

export async function tokenSecurityScan(
  chainIndex: string,
  tokenAddress: string
): Promise<TokenSecurityInfo | null> {
  const path = `/api/v5/dex/security/token?chainIndex=${chainIndex}&tokenContractAddress=${encodeURIComponent(tokenAddress)}`;
  try {
    const data = await web3Request<TokenSecurityInfo[]>("GET", path);
    return Array.isArray(data) ? data[0] ?? null : null;
  } catch {
    return null;
  }
}

// ─── DEX Swap Quote ─────────────────────────────────────────────────
export type SwapQuote = {
  routerResult: {
    toTokenAmount: string;
    estimateGasFee: string;
  };
};

export async function getSwapQuote(params: {
  chainIndex: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  slippage?: string;
}): Promise<SwapQuote | null> {
  const qs = new URLSearchParams({
    chainId: params.chainIndex,
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    amount: params.amount,
    slippage: params.slippage || "0.5",
  });
  const path = `/api/v5/dex/aggregator/quote?${qs.toString()}`;
  try {
    const data = await web3Request<SwapQuote[]>("GET", path);
    return Array.isArray(data) ? data[0] ?? null : null;
  } catch {
    return null;
  }
}

// ─── Grid AI Parameters (V5 public) ────────────────────────────────
export type GridAiParams = {
  annualizedRate: string;
  gridNum: string;
  maxPx: string;
  minPx: string;
  perMaxProfitRate: string;
  perMinProfitRate: string;
  runType: string;
};

export async function getGridAiParams(
  instId: string,
  direction: "long" | "short" | "neutral" = "neutral"
): Promise<GridAiParams | null> {
  // This is a V5 public endpoint, no auth needed
  const url = `${WEB3_BASE}/api/v5/tradingBot/grid/ai-param?algoOrdType=contract_grid&instId=${encodeURIComponent(instId)}&direction=${direction}`;
  try {
    const resp = await fetch(url);
    const json = await resp.json();
    if (json?.code === "0" && json?.data?.length) {
      return json.data[0] as GridAiParams;
    }
    return null;
  } catch {
    return null;
  }
}
