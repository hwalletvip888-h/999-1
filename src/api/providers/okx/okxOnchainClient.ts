import { loadOkxCredentials } from "../../../config/okx";
import { Platform } from "react-native";
import { getHwalletApiBase } from "../../../services/walletApi";
import { Buffer } from "buffer";
/**
 * okxOnchainClient — V6 链上赚币线的客户端
 *
 * 设计原则（H_Wallet_V5_V6_Product_Skills.md 命名锁定）：
 *   - V5（合约策略）走 okxClient.ts → OKX CEX V5 REST API
 *   - V6（链上赚币）走本文件 → H Wallet 后端（与鉴权同源 `EXPO_PUBLIC_HWALLET_API_BASE`），后端再 shell-out 调 OKX onchainos CLI
 *   - 两个 client 严格隔离，不共享签名 / 不共享 baseUrl（本 client 仅以 H Wallet 后端为入口）
 */

/** iPhone + Expo Go 常拦截「公网 http://」（ATS）；局域网仍优先走后端代理 */
function isPublicPlainHttpLikelyIosBlocked(urlStr: string): boolean {
  if (!/^http:\/\//i.test(urlStr)) return false;
  if (/^(https?:\/\/)?(localhost|127\.0\.0\.1)(\/?|$)/i.test(urlStr)) return false;
  try {
    const { hostname } = new URL(urlStr);
    const p = hostname.split(".").map((x) => parseInt(x, 10));
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    const [a, b] = [p[0], p[1]];
    if (a === 10) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    return true;
  } catch {
    return true;
  }
}

export type ChainId = "ethereum" | "solana" | "xlayer" | "polygon" | "arbitrum" | "base" | "bsc";

export type WalletPortfolioToken = {
  chain: ChainId;
  symbol: string;
  amount: string;
  usdValue: string;
  contract?: string;
  logo?: string;
};

export type WalletPortfolio = {
  totalUsd: string;
  tokens: WalletPortfolioToken[];
  lastUpdatedAt: string;
};

export type DexSwapQuote = {
  fromChain: ChainId;
  fromSymbol: string;
  fromAmount: string;
  toChain: ChainId;
  toSymbol: string;
  toAmount: string;
  rate: string;
  routerLabel: string;
  estimatedGasUsd: string;
  slippageBps: number;
  priceImpactBps: number;
};

export type DexSwapExecuteResult = {
  txHash: string;
  explorerUrl?: string;
  status: "submitted" | "pending" | "confirmed";
};

export type DefiOpportunity = {
  id: string;
  protocol: string;            // Aave / Lido / Compound / Pendle ...
  chain: ChainId;
  asset: string;
  apr: string;                 // 年化 % 字符串 e.g. "5.32"
  tvlUsd: string;
  riskTag: "low" | "medium" | "high";
  source: "smart_money" | "trend" | "trenches";
  description: string;
  contract?: string;
  securityScore: number;       // 0..100
};

export type DefiPosition = {
  id: string;
  protocol: string;
  chain: ChainId;
  amountUsd: string;
  apr: string;
  unclaimedRewardsUsd: string;
  startedAt: string;
};

export type DexSignal = {
  id: string;
  signalType: "smart_money_buy" | "kol_call" | "trenches_new";
  symbol: string;
  contract?: string;
  chain: ChainId;
  marketCapUsd: string;
  priceUsd: string;
  changePct24h: string;
  description: string;
  source: string;
  capturedAt: string;
};

async function callBackend<T>(path: string, options: { method?: "GET" | "POST"; body?: any; token?: string; builderCode?: string } = {}): Promise<T> {
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
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    throw new Error(`[okxOnchainClient] HTTP ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

function toChainId(input: any): ChainId {
  const v = String(input ?? "").toLowerCase();
  if (v === "501" || v.includes("sol")) return "solana";
  if (v === "196" || v.includes("xlayer") || v.includes("x layer")) return "xlayer";
  if (v.includes("polygon")) return "polygon";
  if (v.includes("arbitrum")) return "arbitrum";
  if (v.includes("base")) return "base";
  if (v.includes("bsc") || v.includes("bnb")) return "bsc";
  return "ethereum";
}

function decodeBase64Utf8(b64: string): string | null {
  try {
    let s = b64.trim().replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (s.length % 4)) % 4;
    s += "=".repeat(pad);
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    if (typeof globalThis.atob === "function") {
      try {
        let s = b64.trim().replace(/-/g, "+").replace(/_/g, "/");
        const pad = (4 - (s.length % 4)) % 4;
        s += "=".repeat(pad);
        return globalThis.atob(s);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** 从登录 session（整段 Base64(JSON) 或 JWT）里取出 OKX Agentic accessToken */
function extractAccessTokenFromAgentSession(sessionToken: string): string | null {
  const json = decodeBase64Utf8(sessionToken);
  if (json) {
    try {
      const o = JSON.parse(json) as { accessToken?: string };
      if (typeof o?.accessToken === "string" && o.accessToken.length > 8) return o.accessToken;
    } catch {
      /* fallthrough */
    }
  }
  const parts = sessionToken.split(".");
  if (parts.length === 3) {
    const payloadJson = decodeBase64Utf8(parts[1]);
    if (payloadJson) {
      try {
        const p = JSON.parse(payloadJson) as { accessToken?: string };
        if (typeof p?.accessToken === "string" && p.accessToken.length > 8) return p.accessToken;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

function extractPortfolioTokenRows(root: any): any[] {
  if (!root) return [];
  if (Array.isArray(root)) return root;
  if (typeof root !== "object") return [];
  const o = root as Record<string, unknown>;
  for (const k of ["tokens", "balances", "assets", "tokenList", "records", "list", "details", "items", "balanceList", "tokenBalances"]) {
    if (Array.isArray(o[k])) return o[k] as any[];
  }
  return [];
}

function normalizePortfolioPayload(payload: any): WalletPortfolio | null {
  if (payload?.ok === false) return null;

  let root: any = payload?.data ?? payload;
  /** OKX：`{ code: "0", data: null | [] }` 表示空持仓，不能当成解析失败 */
  if (root == null) return null;
  if (typeof root === "object" && !Array.isArray(root)) {
    if (root.code !== undefined && String(root.code) !== "0") return null;
    if (root.code !== undefined && String(root.code) === "0") {
      if (root.data == null) {
        return { totalUsd: "0.00", tokens: [], lastUpdatedAt: new Date().toISOString() };
      }
      root = root.data;
    }
    if (root == null) {
      return { totalUsd: "0.00", tokens: [], lastUpdatedAt: new Date().toISOString() };
    }
  }

  const mapRow = (t: any): WalletPortfolioToken => ({
    chain: toChainId(t.chain ?? t.chainId ?? t.chainIndex ?? t.network),
    symbol: String(t.symbol ?? t.tokenSymbol ?? t.currency ?? "").toUpperCase(),
    amount: String(t.amount ?? t.balance ?? t.total ?? t.qty ?? "0"),
    usdValue: String(t.usdValue ?? t.valueUsd ?? t.usd ?? t.usdtValue ?? t.usdAmount ?? "0"),
    contract: t.contract ?? t.tokenAddress,
    logo: t.logo ?? t.logoUrl
  });

  const buildPortfolio = (rows: any[], extras: { totalUsd?: string; lastUpdatedAt?: string }) => {
    const mapped = rows.map(mapRow).filter((t: WalletPortfolioToken) => !!t.symbol);
    const totalUsd =
      extras.totalUsd !== undefined
        ? String(extras.totalUsd)
        : mapped.reduce((sum, t) => sum + Number(t.usdValue || 0), 0).toFixed(2);
    return {
      totalUsd,
      tokens: mapped,
      lastUpdatedAt: String(extras.lastUpdatedAt ?? new Date().toISOString())
    };
  };

  if (Array.isArray(root)) {
    if (!root.length) {
      return { totalUsd: "0.00", tokens: [], lastUpdatedAt: new Date().toISOString() };
    }
    return buildPortfolio(root, {});
  }

  if (typeof root !== "object") return null;

  const rows = extractPortfolioTokenRows(root);
  if (rows.length) {
    const totalHint =
      root.totalUsd ?? root.totalValueUsd ?? payload.totalUsd ?? payload?.data?.totalUsd;
    return buildPortfolio(rows, {
      totalUsd: totalHint !== undefined ? String(totalHint) : undefined,
      lastUpdatedAt: root.lastUpdatedAt
    });
  }

  if (Array.isArray(root.tokens)) {
    return buildPortfolio(root.tokens, {
      totalUsd:
        root.totalUsd !== undefined || root.totalValueUsd !== undefined
          ? String(root.totalUsd ?? root.totalValueUsd ?? "0")
          : undefined,
      lastUpdatedAt: root.lastUpdatedAt
    });
  }

  /** 后端 { ok: true } 但无已知列表字段时，按空持仓展示 */
  if (payload?.ok === true && typeof root === "object") {
    const nested = extractPortfolioTokenRows(root).length;
    const tokenLen = Array.isArray(root.tokens) ? root.tokens.length : 0;
    if (nested === 0 && tokenLen === 0) {
      return buildPortfolio([], {
        totalUsd:
          root.totalUsd !== undefined || root.totalValueUsd !== undefined || payload.totalUsd !== undefined
            ? String(root.totalUsd ?? root.totalValueUsd ?? payload.totalUsd ?? "0")
            : "0.00",
        lastUpdatedAt: root.lastUpdatedAt
      });
    }
  }

  /** 兜底：只要是 OKX「成功」信封但未能解析列表，宁可展示空持仓，也不要判成接口不可用 */
  if (payload && typeof payload === "object" && String((payload as any).code) === "0") {
    return buildPortfolio([], { totalUsd: "0.00" });
  }

  return null;
}

async function tryDirectAgenticPortfolioByToken(token: string): Promise<WalletPortfolio | null> {
  try {
    const accessToken = extractAccessTokenFromAgentSession(token);
    if (!accessToken) return null;
    const candidatePaths = [
      "/priapi/v5/wallet/agentic/account/portfolio",
      "/priapi/v5/wallet/agentic/account/assets",
      "/priapi/v5/wallet/agentic/account/balances",
      "/priapi/v5/wallet/agentic/account/token-balances",
      "/priapi/v5/wallet/agentic/account/asset-balance",
      "/priapi/v5/wallet/agentic/account/asset-list"
    ];
    for (const p of candidatePaths) {
      try {
        const res = await fetch(`https://web3.okx.com${p}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "ok-client-version": "3.0.0",
            "Ok-Access-Client-type": "agent-cli",
            "Authorization": `Bearer ${accessToken}`
          }
        });
        if (!res.ok) continue;
        const data = await res.json();
        const normalized = normalizePortfolioPayload(data);
        if (normalized) return normalized;
      } catch {
        // try next endpoint
      }
    }
    return null;
  } catch {
    return null;
  }
}

export const okxOnchainClient = {
  /** 多链钱包资产汇总（经后端代理或直接 OKX Agentic） */
  async getWalletPortfolio(token: string): Promise<{ data: WalletPortfolio; simulationMode: boolean }> {
    const backendBase = getHwalletApiBase();

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[okxOnchainClient] getWalletPortfolio backendBase:", backendBase || "(未配置)");
    }

    // 移动端优先直连 OKX Agentic，避免后端未开放资产路由时首页报错
    if (Platform.OS !== "web") {
      const earlyDirect = await tryDirectAgenticPortfolioByToken(token);
      if (earlyDirect) return { data: earlyDirect, simulationMode: false };
    }

    if (!backendBase) {
      const direct = await tryDirectAgenticPortfolioByToken(token);
      if (direct) return { data: direct, simulationMode: false };
      throw new Error("未配置 EXPO_PUBLIC_HWALLET_API_BASE，无法经后端拉取钱包资产。");
    }

    if (Platform.OS !== "web" && isPublicPlainHttpLikelyIosBlocked(backendBase)) {
      const early = await tryDirectAgenticPortfolioByToken(token);
      if (early) return { data: early, simulationMode: false };
    }

    const candidates = [
      "/api/v6/wallet/portfolio",
      "/api/agent-wallet/portfolio",
      "/api/agent-wallet/balance",
      "/api/wallet/portfolio",
      "/api/wallet/balance"
    ];
    for (const path of candidates) {
      try {
        const raw = await callBackend<any>(path, { token });
        const normalized = normalizePortfolioPayload(raw);
        if (normalized) return { data: normalized, simulationMode: false };
      } catch {
        /* try next */
      }
    }

    const direct = Platform.OS === "web" ? null : await tryDirectAgenticPortfolioByToken(token);
    if (direct) return { data: direct, simulationMode: false };

    // 最终兜底：对新钱包/零资产用户，资产接口短时不可用时仍展示空资产而非错误横幅
    return {
      data: {
        totalUsd: "0.00",
        tokens: [],
        lastUpdatedAt: new Date().toISOString()
      },
      simulationMode: true
    };
  },

  /** DEX 聚合器报价 */
  async getSwapQuote(params: {
    fromChain: ChainId; fromSymbol: string; fromAmount: string;
    toChain: ChainId; toSymbol: string; slippageBps?: number;
  }, token?: string): Promise<{ data: DexSwapQuote; simulationMode: boolean }> {
    const creds = loadOkxCredentials();
    const builderCode = creds?.builderCode;
    const data = await callBackend<DexSwapQuote>("/api/v6/dex/swap-quote", {
      method: "POST",
      body: { ...params, builderCode },
      token,
      builderCode
    });
    return { data, simulationMode: false };
  },

  async executeSwap(params: {
    fromChain: ChainId; fromSymbol: string; fromAmount: string;
    toChain: ChainId; toSymbol: string; slippageBps?: number;
  }, token?: string): Promise<{ data: DexSwapExecuteResult; simulationMode: boolean }> {
    const creds = loadOkxCredentials();
    const builderCode = creds?.builderCode;
    const data = await callBackend<DexSwapExecuteResult>("/api/v6/dex/swap-execute", {
      method: "POST",
      body: { ...params, builderCode },
      token,
      builderCode
    });
    return { data, simulationMode: false };
  },

  async discoverOpportunities(
    filter: { minApr?: number; chain?: ChainId; riskTag?: "low" | "medium" | "high" } = {},
    token?: string
  ): Promise<{ data: DefiOpportunity[]; simulationMode: boolean }> {
    const data = await callBackend<DefiOpportunity[]>("/api/v6/defi/discover", {
      method: "POST",
      body: filter,
      token
    });
    return { data: Array.isArray(data) ? data : [], simulationMode: false };
  },

  async getDefiPositions(token: string): Promise<{ data: DefiPosition[]; simulationMode: boolean }> {
    const data = await callBackend<DefiPosition[]>("/api/v6/defi/portfolio", { token });
    return { data: Array.isArray(data) ? data : [], simulationMode: false };
  },

  async fetchSignals(
    filter: { signalType?: "smart_money_buy" | "kol_call" | "trenches_new"; chain?: ChainId } = {},
    token?: string
  ): Promise<{ data: DexSignal[]; simulationMode: boolean }> {
    const data = await callBackend<DexSignal[]>("/api/v6/dex/signal", {
      method: "POST",
      body: filter,
      token
    });
    return { data: Array.isArray(data) ? data : [], simulationMode: false };
  },

  async securityScan(
    params: { contract: string; chain: ChainId },
    token?: string
  ): Promise<{ data: { score: number; flags: string[]; isHoneypot: boolean }; simulationMode: boolean }> {
    const data = await callBackend<{ score: number; flags: string[]; isHoneypot: boolean }>(
      "/api/v6/security/scan",
      { method: "POST", body: params, token }
    );
    return { data, simulationMode: false };
  }
};
