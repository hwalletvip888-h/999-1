/**
 * okxOnchainClient — V6 链上赚币线的客户端
 *
 * 设计原则（H_Wallet_V5_V6_Product_Skills.md 命名锁定）：
 *   - V5（合约策略）走 okxClient.ts → OKX CEX V5 REST API
 *   - V6（链上赚币）走本文件 → H Wallet 后端（hvip.io），后端再 shell-out 调 OKX onchainos CLI
 *   - 两个 client 严格隔离，不共享签名 / 不共享 baseUrl
 *
 * 后端约定：服务器执行 `pip install onchainos` 后通过 execSync 调用：
 *   - onchainos wallet portfolio      → 多链余额
 *   - onchainos dex swap-quote        → DEX 聚合报价
 *   - onchainos dex trenches          → 战壕信号（聪明钱新币）
 *   - onchainos defi invest discover  → DeFi 机会发现
 *   - onchainos defi invest portfolio → DeFi 仓位汇总
 *   - onchainos security scan         → 合约 / Token 安全审计
 *
 * 当前未部署对应 backend → 所有方法都先返回 mock，标记 simulationMode:true
 * 标志位用于 UI 显示「演示数据」徽章。
 */

const BASE_URL = process.env.EXPO_PUBLIC_HWALLET_API_BASE
  || process.env.HWALLET_API_BASE
  || "https://api.hvip.io";

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

async function callBackend<T>(path: string, options: { method?: "GET" | "POST"; body?: any; token?: string } = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
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

// ─── Mock 兜底（backend 未部署或离线时使用） ─────────────────

function mockPortfolio(): WalletPortfolio {
  return {
    totalUsd: "0.00",
    tokens: [],
    lastUpdatedAt: new Date().toISOString()
  };
}

function mockOpportunities(): DefiOpportunity[] {
  return [
    {
      id: "demo_lido",
      protocol: "Lido",
      chain: "ethereum",
      asset: "ETH",
      apr: "3.82",
      tvlUsd: "32.4B",
      riskTag: "low",
      source: "smart_money",
      description: "Lido 流动性质押，长期被聪明钱地址加仓。",
      securityScore: 92
    },
    {
      id: "demo_aave",
      protocol: "Aave",
      chain: "polygon",
      asset: "USDT",
      apr: "5.20",
      tvlUsd: "12.1B",
      riskTag: "low",
      source: "trend",
      description: "Aave 借贷市场 USDT 存款，年化 5.20%。",
      securityScore: 88
    }
  ];
}

function mockSignals(): DexSignal[] {
  return [];
}

// ─── 公开 API ─────────────────────────────────────────────────

export const okxOnchainClient = {
  /** 多链钱包资产汇总（onchainos wallet portfolio） */
  async getWalletPortfolio(token: string): Promise<{ data: WalletPortfolio; simulationMode: boolean }> {
    try {
      const data = await callBackend<WalletPortfolio>("/api/v6/wallet/portfolio", { token });
      return { data, simulationMode: false };
    } catch {
      return { data: mockPortfolio(), simulationMode: true };
    }
  },

  /** DEX 聚合器报价（onchainos dex swap-quote） */
  async getSwapQuote(params: {
    fromChain: ChainId; fromSymbol: string; fromAmount: string;
    toChain: ChainId; toSymbol: string; slippageBps?: number;
  }, token?: string): Promise<{ data: DexSwapQuote; simulationMode: boolean }> {
    try {
      const data = await callBackend<DexSwapQuote>("/api/v6/dex/swap-quote", { method: "POST", body: params, token });
      return { data, simulationMode: false };
    } catch {
      return {
        data: {
          fromChain: params.fromChain, fromSymbol: params.fromSymbol, fromAmount: params.fromAmount,
          toChain: params.toChain, toSymbol: params.toSymbol, toAmount: "0",
          rate: "—", routerLabel: "OKX DEX", estimatedGasUsd: "0.50",
          slippageBps: params.slippageBps ?? 50, priceImpactBps: 0
        },
        simulationMode: true
      };
    }
  },

  /** 链上赚币机会发现（onchainos defi invest discover） */
  async discoverOpportunities(filter: { minApr?: number; chain?: ChainId; riskTag?: "low" | "medium" | "high" } = {}, token?: string): Promise<{ data: DefiOpportunity[]; simulationMode: boolean }> {
    try {
      const data = await callBackend<DefiOpportunity[]>("/api/v6/defi/discover", { method: "POST", body: filter, token });
      return { data, simulationMode: false };
    } catch {
      let mock = mockOpportunities();
      if (filter.minApr) mock = mock.filter((o) => parseFloat(o.apr) >= filter.minApr!);
      if (filter.chain) mock = mock.filter((o) => o.chain === filter.chain);
      if (filter.riskTag) mock = mock.filter((o) => o.riskTag === filter.riskTag);
      return { data: mock, simulationMode: true };
    }
  },

  /** 用户当前 DeFi 仓位（onchainos defi invest portfolio） */
  async getDefiPositions(token: string): Promise<{ data: DefiPosition[]; simulationMode: boolean }> {
    try {
      const data = await callBackend<DefiPosition[]>("/api/v6/defi/portfolio", { token });
      return { data, simulationMode: false };
    } catch {
      return { data: [], simulationMode: true };
    }
  },

  /** 链上信号订阅（聪明钱 / KOL / 战壕） — 来自 trend_engine 与 onchainos dex trenches */
  async fetchSignals(filter: { signalType?: "smart_money_buy" | "kol_call" | "trenches_new"; chain?: ChainId } = {}, token?: string): Promise<{ data: DexSignal[]; simulationMode: boolean }> {
    try {
      const data = await callBackend<DexSignal[]>("/api/v6/dex/signal", { method: "POST", body: filter, token });
      return { data, simulationMode: false };
    } catch {
      return { data: mockSignals(), simulationMode: true };
    }
  },

  /** Token / 合约安全审计（onchainos security scan） */
  async securityScan(params: { contract: string; chain: ChainId }, token?: string): Promise<{ data: { score: number; flags: string[]; isHoneypot: boolean }; simulationMode: boolean }> {
    try {
      const data = await callBackend<{ score: number; flags: string[]; isHoneypot: boolean }>("/api/v6/security/scan", { method: "POST", body: params, token });
      return { data, simulationMode: false };
    } catch {
      return { data: { score: 70, flags: ["未审计 / 数据未加载"], isHoneypot: false }, simulationMode: true };
    }
  }
};
