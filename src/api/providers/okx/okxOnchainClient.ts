import { loadOkxCredentials } from "../../../config/okx";
import { Platform } from "react-native";
import { getHwalletApiBase, loadSession } from "../../../services/walletApi";
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

function hasVisibleBalance(p: WalletPortfolio | null): boolean {
  if (!p) return false;
  if (Number(p.totalUsd || 0) > 0) return true;
  return (p.tokens ?? []).some((t) => Number(t.amount || 0) > 0 || Number(t.usdValue || 0) > 0);
}

type RpcAddressRow = { chainIndex: string; chainName: string; address: string };

async function rpcCall(url: string, method: string, params: any[]): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json?.error) return null;
  return json?.result;
}

function pad32(hexNo0x: string): string {
  return hexNo0x.padStart(64, "0");
}

function toLower0x(addr: string): string {
  const a = String(addr || "").trim();
  if (!a) return a;
  return a.startsWith("0x") ? `0x${a.slice(2).toLowerCase()}` : `0x${a.toLowerCase()}`;
}

function encodeBalanceOf(owner: string): string {
  // balanceOf(address) selector: 0x70a08231
  const o = toLower0x(owner).replace(/^0x/, "");
  return `0x70a08231${pad32(o)}`;
}

async function rpcErc20Balance(url: string, token: string, owner: string): Promise<bigint | null> {
  const data = encodeBalanceOf(owner);
  const callRes = await rpcCall(url, "eth_call", [{ to: toLower0x(token), data }, "latest"]);
  if (typeof callRes !== "string" || !callRes.startsWith("0x")) return null;
  try {
    return BigInt(callRes);
  } catch {
    return null;
  }
}

function formatUnits(raw: bigint, decimals: number): number {
  const d = BigInt(10) ** BigInt(decimals);
  const whole = raw / d;
  const frac = raw % d;
  const frac6 = (frac * BigInt(1_000_000)) / d;
  return Number(whole) + Number(frac6) / 1_000_000;
}

function normalizeAddressRows(input: any): RpcAddressRow[] {
  if (!input) return [];
  const source: any[] = Array.isArray(input)
    ? input
    : Array.isArray(input?.addressList)
      ? input.addressList
      : Array.isArray(input?.data)
        ? input.data
        : [];
  return source
    .map((x) => ({
      chainIndex: String(x?.chainIndex ?? x?.chain_index ?? ""),
      chainName: String(x?.chainName ?? x?.chain_name ?? "Unknown"),
      address: String(x?.address ?? "")
    }))
    .filter((x) => !!x.address);
}

async function fetchAddressesViaBackend(token: string): Promise<RpcAddressRow[]> {
  const base = getHwalletApiBase();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/wallet/addresses`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const payload = await res.json();
    if (payload?.ok === false) return [];
    return normalizeAddressRows(payload?.addresses ?? payload?.data ?? payload);
  } catch {
    return [];
  }
}

async function fetchAddressesViaSession(): Promise<RpcAddressRow[]> {
  try {
    const s = await loadSession();
    if (!s?.addresses) return [];
    const rows: RpcAddressRow[] = [];
    const add = (arr: any[]) => {
      for (const a of arr ?? []) {
        const address = String(a?.address ?? "").trim();
        if (!address || address === "N/A") continue;
        rows.push({
          chainIndex: String(a?.chainIndex ?? ""),
          chainName: String(a?.chainName ?? "Unknown"),
          address
        });
      }
    };
    add(s.addresses.evm as any[]);
    add(s.addresses.solana as any[]);
    add(s.addresses.xlayer as any[]);
    return rows;
  } catch {
    return [];
  }
}

async function fetchPriceUsd(symbol: string): Promise<number> {
  if (symbol === "USDT" || symbol === "USDC") return 1;
  try {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}-USDT`);
    if (!res.ok) return 0;
    const json = await res.json();
    const px = Number(json?.data?.[0]?.last ?? 0);
    return Number.isFinite(px) && px > 0 ? px : 0;
  } catch {
    return 0;
  }
}

async function tryRpcPortfolioByToken(token: string): Promise<WalletPortfolio | null> {
  const sessionRows = await fetchAddressesViaSession();
  const backendRows = await fetchAddressesViaBackend(token);
  const seen = new Set<string>();
  const rows = [...sessionRows, ...backendRows].filter((r) => {
    const k = `${r.chainIndex}:${r.address.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!rows.length) return null;

  const evmRpcByChain: Record<string, { chain: ChainId; symbol: string; rpc: string }> = {
    "1": { chain: "ethereum", symbol: "ETH", rpc: "https://cloudflare-eth.com" },
    "56": { chain: "bsc", symbol: "BNB", rpc: "https://bsc-dataseed.binance.org" },
    "137": { chain: "polygon", symbol: "MATIC", rpc: "https://polygon-rpc.com" },
    "42161": { chain: "arbitrum", symbol: "ETH", rpc: "https://arb1.arbitrum.io/rpc" },
    "8453": { chain: "base", symbol: "ETH", rpc: "https://mainnet.base.org" },
    "10": { chain: "base", symbol: "ETH", rpc: "https://mainnet.optimism.io" },
    "196": { chain: "xlayer", symbol: "OKB", rpc: "https://rpc.xlayer.tech" }
  };

  // ERC20 兜底：按链补齐 stablecoins（全按 6 decimals；多合约时求和）
  const erc20ByChainIndex: Record<string, Array<{ symbol: string; decimals: number; addresses: string[] }>> = {
    // Ethereum
    "1": [{ symbol: "USDT", decimals: 6, addresses: ["0xdac17f958d2ee523a2206206994597c13d831ec7"] }],
    // BSC
    "56": [{ symbol: "USDT", decimals: 18, addresses: ["0x55d398326f99059ff775485246999027b3197955"] }],
    // Polygon
    "137": [{ symbol: "USDT", decimals: 6, addresses: ["0xc2132d05d31c914a87c6611c10748aeb04b58e8f"] }],
    // Arbitrum / Base / Optimism / X Layer（来自你提供的常用地址列表）
    "42161": [{ symbol: "USDT", decimals: 6, addresses: ["0xfde4c96c8593536e31f229ea8f37b2ada2699bb2"] }],
    "8453": [
      { symbol: "USDT", decimals: 6, addresses: ["0xf55bec9cafdbe8730f096aa55dad6d22d44099df", "0xfe97e85d13abd9c1c33384e796f10b73905637ce", "0x493257fd37edb34451f62edf8d2a0c418852ba4c"] }
    ],
    "10": [{ symbol: "USDT", decimals: 6, addresses: ["0x94b008aa00579c1307b0ef2c499ad98a8ce58e58"] }],
    "196": [{ symbol: "USDT", decimals: 6, addresses: ["0x779ded0c9e1022225f8e0630b35a9b54be713736"] }]
  };

  const tokens: WalletPortfolioToken[] = [];
  const priceCache = new Map<string, number>();
  const getPrice = async (symbol: string) => {
    if (priceCache.has(symbol)) return priceCache.get(symbol) as number;
    const p = await fetchPriceUsd(symbol);
    priceCache.set(symbol, p);
    return p;
  };

  for (const row of rows) {
    const chain = evmRpcByChain[row.chainIndex];
    if (chain) {
      const balHex = await rpcCall(chain.rpc, "eth_getBalance", [row.address, "latest"]);
      if (typeof balHex !== "string") {
        // 即便原生余额取不到，也尝试 ERC20
      }
      let amount = 0;
      try {
        if (typeof balHex === "string") amount = Number(BigInt(balHex) / BigInt(10 ** 10)) / 1e8;
      } catch {
        amount = 0;
      }
      if (amount > 0) {
        const px = await getPrice(chain.symbol);
        tokens.push({
          chain: chain.chain,
          symbol: chain.symbol,
          amount: amount.toFixed(8),
          usdValue: (amount * px).toFixed(2)
        });
      }

      const erc20s = erc20ByChainIndex[row.chainIndex] ?? [];
      for (const t of erc20s) {
        let rawSum = 0n;
        for (const addr of t.addresses) {
          const raw = await rpcErc20Balance(chain.rpc, addr, row.address);
          if (raw && raw > 0n) rawSum += raw;
        }
        if (rawSum <= 0n) continue;
        const amt = formatUnits(rawSum, t.decimals);
        if (amt <= 0) continue;
        const p = await getPrice(t.symbol);
        tokens.push({
          chain: chain.chain,
          symbol: t.symbol,
          amount: amt.toFixed(6),
          usdValue: (amt * p).toFixed(2)
        });
      }
      continue;
    }

    if (row.chainIndex === "501") {
      const lamports = await rpcCall("https://api.mainnet-beta.solana.com", "getBalance", [row.address]);
      const val = Number(lamports?.value ?? 0);
      if (!Number.isFinite(val) || val <= 0) continue;
      const amount = val / 1e9;
      const px = await getPrice("SOL");
      tokens.push({
        chain: "solana",
        symbol: "SOL",
        amount: amount.toFixed(8),
        usdValue: (amount * px).toFixed(2)
      });

      // Solana USDT (mint)
      try {
        const mint = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
        const resp = await rpcCall("https://api.mainnet-beta.solana.com", "getTokenAccountsByOwner", [
          row.address,
          { mint },
          { encoding: "jsonParsed" }
        ]);
        const accounts: any[] = Array.isArray(resp?.value) ? resp.value : [];
        const sum = accounts.reduce((s, it) => {
          const ui = Number(it?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0);
          return s + (Number.isFinite(ui) ? ui : 0);
        }, 0);
        if (sum > 0) {
          const p = await getPrice("USDT");
          tokens.push({
            chain: "solana",
            symbol: "USDT",
            amount: sum.toFixed(6),
            usdValue: (sum * p).toFixed(2),
            contract: mint
          });
        }
      } catch {
        /* ignore */
      }
    }
  }

  const totalUsd = tokens.reduce((s, t) => s + Number(t.usdValue || 0), 0);
  return {
    totalUsd: totalUsd.toFixed(2),
    tokens,
    lastUpdatedAt: new Date().toISOString()
  };
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
      const earlyRpc = await tryRpcPortfolioByToken(token);
      if (earlyDirect && hasVisibleBalance(earlyDirect)) return { data: earlyDirect, simulationMode: false };
      if (earlyRpc && hasVisibleBalance(earlyRpc)) return { data: earlyRpc, simulationMode: false };
      if (earlyDirect) return { data: earlyDirect, simulationMode: false };
      if (earlyRpc) return { data: earlyRpc, simulationMode: false };
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
    const rpcFallback = Platform.OS === "web" ? null : await tryRpcPortfolioByToken(token);
    if (direct && hasVisibleBalance(direct)) return { data: direct, simulationMode: false };
    if (rpcFallback && hasVisibleBalance(rpcFallback)) return { data: rpcFallback, simulationMode: false };
    if (direct) return { data: direct, simulationMode: false };
    if (rpcFallback) return { data: rpcFallback, simulationMode: false };

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
