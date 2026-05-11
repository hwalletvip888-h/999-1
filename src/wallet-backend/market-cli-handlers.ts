/**
 * OnchainOS Market / Signal / Token 读接口 — 供 BFF `/api/v6/dex/*`、`/api/v6/defi/discover` 调用
 */
import { homeFromToken } from "./cli-home";
import { mapClientChainToCli } from "./dex-tokens";
import { isOnchainosCliAvailable, runOnchainosJson } from "./onchainos-cli";

type ChainId = "ethereum" | "solana" | "xlayer" | "polygon" | "arbitrum" | "base" | "bsc";

function safeHome(token: string | undefined): string | undefined {
  const t = (token || "").trim();
  if (!t) return process.env.ONCHAINOS_HOME || undefined;
  try {
    return homeFromToken(t).home;
  } catch {
    return process.env.ONCHAINOS_HOME || undefined;
  }
}

function firstArray(raw: unknown): any[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(o.data)) return o.data as any[];
  if (Array.isArray(o.list)) return o.list as any[];
  if (Array.isArray(o.items)) return o.items as any[];
  if (Array.isArray(o.signals)) return o.signals as any[];
  if (Array.isArray(o.activities)) return o.activities as any[];
  return [];
}

function chainIndexToId(idx: unknown): ChainId {
  const n = typeof idx === "string" ? parseInt(idx, 10) : Number(idx);
  if (!Number.isFinite(n)) return "ethereum";
  const m: Record<number, ChainId> = {
    1: "ethereum",
    56: "bsc",
    137: "polygon",
    42161: "arbitrum",
    8453: "base",
    196: "xlayer",
    501: "solana",
    1399811149: "solana",
  };
  return m[n] || "ethereum";
}

function chainNameToId(name: unknown): ChainId | null {
  if (typeof name !== "string") return null;
  const v = name.toLowerCase().trim();
  if (/sol/.test(v)) return "solana";
  if (/arb/.test(v)) return "arbitrum";
  if (/poly|matic/.test(v)) return "polygon";
  if (/base/.test(v)) return "base";
  if (/bsc|bnb/.test(v)) return "bsc";
  if (/xlayer|okx/.test(v)) return "xlayer";
  if (/eth/.test(v)) return "ethereum";
  return null;
}

function pickChain(item: Record<string, unknown>, fallback: ChainId): ChainId {
  const fromName = chainNameToId(item.chainName ?? item.chain ?? item.network);
  if (fromName) return fromName;
  return chainIndexToId(item.chainIndex ?? item.chainId ?? item.chain_index);
}

function str(x: unknown, fb = "—"): string {
  if (x === null || x === undefined) return fb;
  const s = String(x).trim();
  return s || fb;
}

/** POST /api/v6/dex/signal — 映射为 App 侧 DexSignal[] */
export function handleDexSignalList(token: string | undefined, body: Record<string, unknown>): unknown[] {
  if (!isOnchainosCliAvailable()) return [];
  const home = safeHome(token);
  const chainCli = mapClientChainToCli(String(body?.chain || "ethereum"));
  const limit = Math.min(50, Math.max(5, Number(body?.limit) || 15));
  const st = String(body?.signalType || "").trim();
  const walletType =
    st === "kol_call" ? "2" : st === "trenches_new" ? "3" : st === "smart_money_buy" ? "1" : "1,2,3";
  let raw: unknown;
  try {
    raw = runOnchainosJson(
      ["signal", "list", "--chain", chainCli, "--limit", String(limit), "--wallet-type", walletType],
      home,
      55_000,
    );
  } catch (e) {
    console.warn("[market-cli] signal list failed", (e as Error)?.message);
    return [];
  }
  if (raw && typeof raw === "object" && (raw as { ok?: boolean }).ok === false) return [];
  const list = firstArray(raw);
  return list.map((item, i) => {
    const it = item as Record<string, unknown>;
    const chain = pickChain(it, chainIndexToId(it.chainIndex));
    const wType = Number(it.walletType ?? it.wallet_type ?? 1);
    const signalType =
      wType === 2 ? "kol_call" : wType === 3 ? "trenches_new" : ("smart_money_buy" as const);
    return {
      id: str(it.cursor ?? it.id ?? it.signalId ?? `sig_${i}`),
      signalType,
      symbol: str(it.tokenSymbol ?? it.symbol ?? it.name, "?").toUpperCase().slice(0, 24),
      contract: it.tokenAddress ? str(it.tokenAddress) : it.contract ? str(it.contract) : undefined,
      chain,
      marketCapUsd: str(it.marketCapUsd ?? it.marketCap ?? it.mc),
      priceUsd: str(it.priceUsd ?? it.price ?? it.tokenPrice),
      changePct24h: str(it.change24h ?? it.changePct24h ?? it.priceChange24h),
      description: str(it.description ?? it.reason ?? it.title, "链上聚合买入信号"),
      source: str(it.source ?? it.platform ?? "OKX DEX"),
      capturedAt: str(it.requestTime ?? it.time ?? it.ts, new Date().toISOString()),
    };
  });
}

/** POST /api/v6/dex/hot-tokens */
export function handleDexHotTokens(token: string | undefined, body: Record<string, unknown>): unknown[] {
  if (!isOnchainosCliAvailable()) return [];
  const home = safeHome(token);
  const limit = Math.min(100, Math.max(5, Number(body?.limit) || 20));
  const args = ["token", "hot-tokens", "--limit", String(limit)];
  const chain = body?.chain ? mapClientChainToCli(String(body.chain)) : "";
  if (chain) args.push("--chain", chain);
  let raw: unknown;
  try {
    raw = runOnchainosJson(args, home, 55_000);
  } catch (e) {
    console.warn("[market-cli] hot-tokens failed", (e as Error)?.message);
    return [];
  }
  if (raw && typeof raw === "object" && (raw as { ok?: boolean }).ok === false) return [];
  const list = firstArray(raw);
  return list.map((item, i) => {
    const it = item as Record<string, unknown>;
    const chainId = pickChain(it, "ethereum");
    return {
      rank: i + 1,
      symbol: str(it.tokenSymbol ?? it.symbol ?? it.name, "?").toUpperCase().slice(0, 24),
      chain: chainId,
      address: it.tokenAddress ? str(it.tokenAddress) : it.address ? str(it.address) : undefined,
      priceUsd: str(it.priceUsd ?? it.price),
      changePct24h: str(it.change24h ?? it.changePct24h),
      marketCapUsd: str(it.marketCapUsd ?? it.marketCap),
      trendScore: str(it.trendingScore ?? it.score ?? it.rank),
    };
  });
}

/** POST /api/v6/dex/tracker — 信号追踪（聪明钱 / KOL 成交动态） */
export function handleDexTrackerActivities(token: string | undefined, body: Record<string, unknown>): unknown[] {
  if (!isOnchainosCliAvailable()) return [];
  const home = safeHome(token);
  const tt = String(body?.trackerType || "smart_money").toLowerCase();
  const trackerType = tt === "kol" || tt === "kol_call" ? "kol" : "smart_money";
  const limit = Math.min(50, Math.max(5, Number(body?.limit) || 12));
  const args = ["tracker", "activities", "--tracker-type", trackerType, "--limit", String(limit)];
  const chain = body?.chain ? mapClientChainToCli(String(body.chain)) : "";
  if (chain) args.push("--chain", chain);
  let raw: unknown;
  try {
    raw = runOnchainosJson(args, home, 55_000);
  } catch (e) {
    console.warn("[market-cli] tracker activities failed", (e as Error)?.message);
    return [];
  }
  if (raw && typeof raw === "object" && (raw as { ok?: boolean }).ok === false) return [];
  const list = firstArray(raw);
  return list.map((item, i) => {
    const it = item as Record<string, unknown>;
    const chain = pickChain(it, "ethereum");
    return {
      id: str(it.txHash ?? it.hash ?? it.id ?? `tr_${i}`).slice(0, 80),
      trackerType: trackerType,
      side: str(it.side ?? it.tradeType ?? it.type, "—"),
      symbol: str(it.tokenSymbol ?? it.symbol ?? it.baseToken, "?").toUpperCase().slice(0, 24),
      chain,
      amountUsd: str(it.amountUsd ?? it.volumeUsd ?? it.usdAmount),
      txHash: it.txHash ? str(it.txHash) : it.hash ? str(it.hash) : undefined,
      time: str(it.time ?? it.timestamp ?? it.blockTime),
      wallet: it.walletAddress ? str(it.walletAddress).slice(0, 14) + "…" : str(it.wallet, "—"),
    };
  });
}

/** POST /api/v6/defi/discover — 优先 defi search，失败时用热门代币兜底为「机会」列表 */
export function handleDefiDiscover(token: string | undefined, body: Record<string, unknown>): unknown[] {
  if (!isOnchainosCliAvailable()) return [];
  const home = safeHome(token);
  const chainCli = mapClientChainToCli(String(body?.chain || "ethereum"));
  try {
    const raw = runOnchainosJson(
      [
        "defi",
        "search",
        "--token",
        "USDC",
        "--chain",
        chainCli,
        "--product-group",
        "SINGLE_EARN",
        "--page-num",
        "1",
      ],
      home,
      55_000,
    );
    if (raw && typeof raw === "object" && (raw as { ok?: boolean }).ok === false) throw new Error("defi search nok");
    const list = firstArray(raw);
    if (list.length > 0) {
      return list.slice(0, 8).map((item, i) => {
        const it = item as Record<string, unknown>;
        const chain = pickChain(it, chainIndexToId(it.chainIndex));
        const apr = str(it.apr ?? it.estimatedApy ?? it.apy ?? it.yieldApr, "0").replace(/[^\d.\-]/g, "") || "0";
        const tvl = str(it.tvlUsd ?? it.tvl ?? it.totalTvl, "0");
        return {
          id: str(it.investmentId ?? it.id ?? it.poolId ?? `defi_${i}`),
          protocol: str(it.platformName ?? it.platform ?? it.protocolName, "DeFi"),
          chain,
          asset: str(it.investmentName ?? it.tokenSymbol ?? it.symbol, "USDC"),
          apr,
          tvlUsd: tvl,
          riskTag: "medium",
          source: "trend",
          description: str(it.description ?? it.productName ?? "OKX 聚合 DeFi 机会"),
          securityScore: 72,
        };
      });
    }
  } catch {
    /* fall through */
  }

  const hot = handleDexHotTokens(token, { limit: 10, chain: body?.chain || "ethereum" }) as Record<
    string,
    unknown
  >[];
  return hot.map((h, i) => ({
    id: `hot_${str(h.symbol)}_${i}`,
    protocol: "热门榜",
    chain: h.chain as ChainId,
    asset: str(h.symbol),
    apr: str(h.changePct24h, "0").replace(/[^\d.\-]/g, "") || "0",
    tvlUsd: str(h.marketCapUsd, "—"),
    riskTag: "high",
    source: "trenches",
    description: `热门代币 #${h.rank ?? i + 1} · ${str(h.symbol)}`,
    securityScore: 62,
  }));
}
