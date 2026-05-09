import type { ChainId, WalletPortfolio, WalletPortfolioToken } from "./types";

export function toChainId(input: any): ChainId {
  const v = String(input ?? "").toLowerCase().trim();
  if (v === "501" || v.includes("sol")) return "solana";
  if (v === "196" || v.includes("xlayer") || v.includes("x layer")) return "xlayer";
  if (v === "137" || v.includes("polygon") || v.includes("matic")) return "polygon";
  if (v === "42161" || v.includes("arbitrum") || v.includes("arb")) return "arbitrum";
  if (v === "8453" || v.includes("base")) return "base";
  if (v === "56" || v.includes("bsc") || v.includes("bnb") || v.includes("binance")) return "bsc";
  if (v === "10" || v.includes("optimism") || v === "op") return "ethereum";
  if (v === "1" || v.includes("ethereum") || v.includes("eth") || v.includes("mainnet")) return "ethereum";
  return "ethereum";
}

export function extractPortfolioTokenRows(root: any): any[] {
  if (!root) return [];
  if (Array.isArray(root)) return root;
  if (typeof root !== "object") return [];
  const o = root as Record<string, unknown>;
  for (const k of ["tokens", "balances", "assets", "tokenList", "records", "list", "details", "items", "balanceList", "tokenBalances"]) {
    if (Array.isArray(o[k])) return o[k] as any[];
  }
  return [];
}

export function normalizePortfolioPayload(payload: any): WalletPortfolio | null {
  if (payload?.ok === false) return null;

  let root: any = payload?.data ?? payload;
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
    logo: t.logo ?? t.logoUrl,
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
      lastUpdatedAt: String(extras.lastUpdatedAt ?? new Date().toISOString()),
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
    const totalHint = root.totalUsd ?? root.totalValueUsd ?? payload.totalUsd ?? payload?.data?.totalUsd;
    return buildPortfolio(rows, {
      totalUsd: totalHint !== undefined ? String(totalHint) : undefined,
      lastUpdatedAt: root.lastUpdatedAt,
    });
  }

  if (Array.isArray(root.tokens)) {
    return buildPortfolio(root.tokens, {
      totalUsd:
        root.totalUsd !== undefined || root.totalValueUsd !== undefined
          ? String(root.totalUsd ?? root.totalValueUsd ?? "0")
          : undefined,
      lastUpdatedAt: root.lastUpdatedAt,
    });
  }

  if (payload?.ok === true && typeof root === "object") {
    const nested = extractPortfolioTokenRows(root).length;
    const tokenLen = Array.isArray(root.tokens) ? root.tokens.length : 0;
    if (nested === 0 && tokenLen === 0) {
      return buildPortfolio([], {
        totalUsd:
          root.totalUsd !== undefined || root.totalValueUsd !== undefined || payload.totalUsd !== undefined
            ? String(root.totalUsd ?? root.totalValueUsd ?? payload.totalUsd ?? "0")
            : "0.00",
        lastUpdatedAt: root.lastUpdatedAt,
      });
    }
  }

  if (payload && typeof payload === "object" && String((payload as any).code) === "0") {
    return buildPortfolio([], { totalUsd: "0.00" });
  }

  return null;
}
