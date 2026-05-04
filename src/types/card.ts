// 兼容旧有类型定义
export type TradeCardCategory = "perpetual" | "swap" | "agent" | "stake" | "earn" | "grid";
export type TradeCardRow = {
  label: string;
  value: string;
  accent?: "positive" | "negative" | "warning";
};
export type Candle = { o: number; h: number; l: number; c: number };
import type { ProductLine, ProductModule } from "./product";

export type CardType =
  | "trade"
  | "strategy"
  | "wallet_action"
  | "risk_alert"
  | "info";

export type CardHeader =
  | "交易卡片"
  | "策略卡片"
  | "钱包操作卡"
  | "风险提示"
  | "信息卡片";

export type CardStatus =
  | "preview"
  | "pending"
  | "confirmed"
  | "executed"
  | "running"
  | "profit"
  | "loss"
  | "cancelled"
  | "failed"
  | "risk_checking"
  | "ready_to_confirm"
  | "confirming";

export type HWalletCard = {
  id: string;
  productLine: ProductLine;
  module: ProductModule;
  cardType: CardType;
  header: CardHeader;
  title: string;
  symbol?: string;
  pair?: string;
  amount?: number;
  currency?: "USDT" | "USDC" | "ETH" | "BTC" | "HWT";
  direction?: "做多" | "做空" | "买入" | "卖出";
  leverage?: number;
  riskLevel: "低" | "中" | "高";
  status: CardStatus;
  simulationMode: boolean;
  userPrompt: string;
  aiSummary: string;
  createdAt: string;
  executedAt?: string;
  // 以下为 TransactionCard 展示所需的所有可选字段
  pnlPercent?: number;
  contractType?: string;
  candles?: any[];
  entryPrice?: number;
  lastPrice?: number;
  // legacy UI 兼容字段，仅供旧代码使用
  category?: TradeCardCategory;
  rows?: TradeCardRow[];
  primaryAction?: string;
  secondaryAction?: string;
  // SwapCard
  fromAmount?: number;
  fromSymbol?: string;
  toAmount?: number;
  toSymbol?: string;
  rate?: string;
  slippage?: string;
  networkFee?: string;
  // AgentCard
  agentName?: string;
  agentTags?: string[];
  agentTotalProfit?: string;
  agentEquityCurve?: number[];
  agentTodayProfit?: string;
  agentRunDuration?: string;
  agentWinRate?: string;
  // StakeCard
  stakeRiskLevel?: "low" | "medium" | "high";
  stakeProtocol?: string;
  stakeChain?: string;
  stakeApy?: string;
  stakeAmount?: string;
  stakeLockPeriod?: string;
  stakeRewardSymbol?: string;
  stakeEstReward?: string;
  warning?: string;
  // GenericCard
  icon?: string;
  subtitle?: string;
  // PriceCard 行情价格卡片
  priceData?: {
    price: number;
    change24h: number;
    changePercent24h: number;
    high24h: number;
    low24h: number;
    vol24h: number;
    fundingRate?: number;
    sparkData?: number[];
  };
  // PositionCard 持仓卡片
  positions?: Array<{
    instId: string;
    side: 'long' | 'short';
    size: number;
    avgPrice: number;
    markPrice: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
    leverage: number;
    liquidationPrice: number;
    margin: number;
  }>;
  // PortfolioCard 资产总览卡片
  totalEquity?: number;
  balances?: Array<{
    currency: string;
    available: number;
    total: number;
    usdtValue: number;
  }>;
};

// 兼容旧代码
export type TradeCard = HWalletCard;
export type StrategyCard = HWalletCard;
export type Card = HWalletCard;