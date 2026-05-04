/**
 * H_AnalyticsApi — 卡库分析接口契约
 * 职责：胜率 / PnL / 最大回撤 / 投资组合建议
 */

/** 交易统计摘要 */
export interface H_TradingStats {
  /** 总交易次数 */
  totalTrades: number;
  /** 盈利次数 */
  winTrades: number;
  /** 亏损次数 */
  lossTrades: number;
  /** 胜率 */
  winRate: number;
  /** 总盈亏（USDT） */
  totalPnl: number;
  /** 平均盈利（USDT） */
  avgWin: number;
  /** 平均亏损（USDT） */
  avgLoss: number;
  /** 盈亏比 */
  profitFactor: number;
  /** 最大回撤（百分比） */
  maxDrawdown: number;
  /** 最大连续盈利次数 */
  maxConsecutiveWins: number;
  /** 最大连续亏损次数 */
  maxConsecutiveLosses: number;
  /** 夏普比率 */
  sharpeRatio: number;
}

/** 资金利用率 */
export interface H_CapitalUtilization {
  /** 总本金 */
  totalCapital: number;
  /** 已使用本金 */
  usedCapital: number;
  /** 利用率（百分比） */
  utilizationRate: number;
  /** 闲置资金 */
  idleCapital: number;
}

/** 投资组合建议 */
export interface H_PortfolioSuggestion {
  /** 建议类型 */
  type: 'rebalance' | 'reduce_risk' | 'increase_exposure' | 'take_profit';
  /** 建议描述 */
  description: string;
  /** 涉及的币种/策略 */
  targets: string[];
  /** 建议优先级 1-5 */
  priority: number;
  /** 预期收益改善（百分比） */
  expectedImprovement: number;
}

/** 风险评分 */
export interface H_RiskScore {
  /** 总风险评分 0-100（越低越安全） */
  overall: number;
  /** 集中度风险 */
  concentration: number;
  /** 杠杆风险 */
  leverage: number;
  /** 波动率风险 */
  volatility: number;
  /** 流动性风险 */
  liquidity: number;
}

/** H_AnalyticsApi 接口定义 */
export interface IH_AnalyticsApi {
  /** 获取交易统计 */
  getTradingStats(days?: number): Promise<H_TradingStats>;
  /** 获取资金利用率 */
  getCapitalUtilization(): Promise<H_CapitalUtilization>;
  /** 获取投资组合建议 */
  getPortfolioSuggestions(): Promise<H_PortfolioSuggestion[]>;
  /** 获取风险评分 */
  getRiskScore(): Promise<H_RiskScore>;
  /** 获取收益曲线数据 */
  getEquityCurve(days?: number): Promise<Array<{ date: string; equity: number }>>;
}
