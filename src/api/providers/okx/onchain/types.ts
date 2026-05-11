/** V6 链上客户端 — 与后端 `/api/v6/*` 对齐的类型 */

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

export type WalletSendResult = {
  txHash: string;
  status: "submitted" | "pending" | "confirmed";
  explorerUrl?: string;
};

export type DefiOpportunity = {
  id: string;
  protocol: string;
  chain: ChainId;
  asset: string;
  apr: string;
  tvlUsd: string;
  riskTag: "low" | "medium" | "high";
  source: "smart_money" | "trend" | "trenches";
  description: string;
  contract?: string;
  securityScore: number;
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

/** 热门代币榜（BFF `/api/v6/dex/hot-tokens`） */
export type HotTokenRow = {
  rank: number;
  symbol: string;
  chain: ChainId;
  address?: string;
  priceUsd?: string;
  changePct24h?: string;
  marketCapUsd?: string;
  trendScore?: string;
};

/** 信号追踪 — 聪明钱/KOL 成交动态（BFF `/api/v6/dex/tracker`） */
export type DexTrackerActivity = {
  id: string;
  trackerType: string;
  side: string;
  symbol: string;
  chain: ChainId;
  amountUsd?: string;
  txHash?: string;
  time?: string;
  wallet?: string;
};
