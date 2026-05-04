/**
 * H_AnalyticsApi OKX 实盘实现
 * 基于卡库数据 + OKX 账户数据进行分析
 * 胜率 / PnL / 最大回撤 / 投资组合建议
 */

import type {
  IH_AnalyticsApi,
  H_TradingStats,
  H_CapitalUtilization,
  H_PortfolioSuggestion,
  H_RiskScore,
} from '../../contracts/H_AnalyticsApi';
import type { OkxCredentials } from './okxClient';
import * as okxClient from './okxClient';

export class OkxH_AnalyticsApi implements IH_AnalyticsApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  async getTradingStats(days = 30): Promise<H_TradingStats> {
    // 从 OKX 获取历史订单数据
    const res = await okxClient.request(
      'GET',
      `/api/v5/trade/fills-history?instType=SWAP&begin=${Date.now() - days * 86400000}`,
      this.creds
    );
    const fills = res.data || [];

    // 按订单分组计算盈亏
    const trades = this._groupFillsIntoTrades(fills);
    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl < 0);

    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;

    // 计算最大回撤
    const maxDrawdown = this._calcMaxDrawdown(trades);

    // 计算连续盈亏
    const { maxConsecutiveWins, maxConsecutiveLosses } = this._calcConsecutive(trades);

    // 夏普比率（简化版）
    const returns = trades.map((t) => t.pnl);
    const sharpeRatio = this._calcSharpe(returns);

    return {
      totalTrades: trades.length,
      winTrades: wins.length,
      lossTrades: losses.length,
      winRate: trades.length > 0 ? wins.length / trades.length : 0,
      totalPnl,
      avgWin,
      avgLoss,
      profitFactor: avgLoss > 0 ? avgWin / avgLoss : 0,
      maxDrawdown,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      sharpeRatio,
    };
  }

  async getCapitalUtilization(): Promise<H_CapitalUtilization> {
    // 获取账户余额
    const balRes = await okxClient.request('GET', '/api/v5/account/balance', this.creds);
    const details = balRes.data?.[0]?.details || [];
    const totalEquity = parseFloat(balRes.data?.[0]?.totalEq || '0');

    // 获取持仓占用
    const posRes = await okxClient.request('GET', '/api/v5/account/positions?instType=SWAP', this.creds);
    const positions = posRes.data || [];
    const usedMargin = positions.reduce((s: number, p: any) => s + parseFloat(p.margin || '0'), 0);

    return {
      totalCapital: totalEquity,
      usedCapital: usedMargin,
      utilizationRate: totalEquity > 0 ? (usedMargin / totalEquity) * 100 : 0,
      idleCapital: totalEquity - usedMargin,
    };
  }

  async getPortfolioSuggestions(): Promise<H_PortfolioSuggestion[]> {
    const suggestions: H_PortfolioSuggestion[] = [];
    const utilization = await this.getCapitalUtilization();
    const stats = await this.getTradingStats(7);

    // 资金利用率过低
    if (utilization.utilizationRate < 30) {
      suggestions.push({
        type: 'increase_exposure',
        description: `当前资金利用率仅 ${utilization.utilizationRate.toFixed(1)}%，建议适当增加仓位或启动网格策略。`,
        targets: ['BTC-USDT-SWAP', 'ETH-USDT-SWAP'],
        priority: 3,
        expectedImprovement: 15,
      });
    }

    // 资金利用率过高
    if (utilization.utilizationRate > 80) {
      suggestions.push({
        type: 'reduce_risk',
        description: `当前资金利用率 ${utilization.utilizationRate.toFixed(1)}%，风险较高，建议减仓。`,
        targets: [],
        priority: 5,
        expectedImprovement: 20,
      });
    }

    // 连续亏损
    if (stats.maxConsecutiveLosses >= 3) {
      suggestions.push({
        type: 'reduce_risk',
        description: `近期连续亏损 ${stats.maxConsecutiveLosses} 次，建议暂停交易或减小仓位。`,
        targets: [],
        priority: 4,
        expectedImprovement: 10,
      });
    }

    // 盈利较好，建议止盈
    if (stats.totalPnl > 0 && stats.winRate > 0.6) {
      suggestions.push({
        type: 'take_profit',
        description: `近期表现优秀（胜率 ${(stats.winRate * 100).toFixed(0)}%），建议部分止盈锁定收益。`,
        targets: [],
        priority: 2,
        expectedImprovement: 5,
      });
    }

    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  async getRiskScore(): Promise<H_RiskScore> {
    const utilization = await this.getCapitalUtilization();

    // 获取持仓信息计算集中度和杠杆
    const posRes = await okxClient.request('GET', '/api/v5/account/positions?instType=SWAP', this.creds);
    const positions = posRes.data || [];

    // 集中度：最大单一持仓占比
    const margins = positions.map((p: any) => parseFloat(p.margin || '0'));
    const maxMargin = Math.max(0, ...margins);
    const concentration = utilization.usedCapital > 0 ? (maxMargin / utilization.usedCapital) * 100 : 0;

    // 杠杆风险
    const levers = positions.map((p: any) => parseFloat(p.lever || '1'));
    const maxLever = Math.max(1, ...levers);
    const leverageRisk = Math.min(100, (maxLever / 125) * 100);

    // 波动率风险（基于利用率）
    const volatility = Math.min(100, utilization.utilizationRate * 1.2);

    // 流动性风险（基于持仓数量）
    const liquidity = Math.min(100, positions.length * 15);

    // 综合评分
    const overall = Math.round(
      concentration * 0.3 + leverageRisk * 0.3 + volatility * 0.25 + liquidity * 0.15
    );

    return {
      overall,
      concentration: Math.round(concentration),
      leverage: Math.round(leverageRisk),
      volatility: Math.round(volatility),
      liquidity: Math.round(liquidity),
    };
  }

  async getEquityCurve(days = 30): Promise<Array<{ date: string; equity: number }>> {
    // 从 OKX 获取账户权益历史（简化：使用盈亏历史构建）
    const res = await okxClient.request(
      'GET',
      `/api/v5/account/bills?type=2&begin=${Date.now() - days * 86400000}`,
      this.creds
    );
    const bills = res.data || [];

    // 按天聚合
    const dailyMap = new Map<string, number>();
    let cumPnl = 0;
    for (const bill of bills.reverse()) {
      const date = new Date(parseInt(bill.ts || '0')).toISOString().slice(0, 10);
      cumPnl += parseFloat(bill.pnl || '0');
      dailyMap.set(date, cumPnl);
    }

    return Array.from(dailyMap.entries()).map(([date, equity]) => ({ date, equity }));
  }

  /** 将成交记录分组为交易 */
  private _groupFillsIntoTrades(fills: any[]): Array<{ pnl: number; timestamp: number }> {
    // 简化：每条 fill 视为一笔独立交易
    return fills.map((f) => ({
      pnl: parseFloat(f.pnl || '0'),
      timestamp: parseInt(f.ts || '0'),
    })).filter((t) => t.pnl !== 0);
  }

  /** 计算最大回撤 */
  private _calcMaxDrawdown(trades: Array<{ pnl: number }>): number {
    let peak = 0;
    let cumPnl = 0;
    let maxDD = 0;
    for (const t of trades) {
      cumPnl += t.pnl;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak > 0 ? (peak - cumPnl) / peak : 0;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD * 100; // 百分比
  }

  /** 计算连续盈亏 */
  private _calcConsecutive(trades: Array<{ pnl: number }>): { maxConsecutiveWins: number; maxConsecutiveLosses: number } {
    let maxW = 0, maxL = 0, curW = 0, curL = 0;
    for (const t of trades) {
      if (t.pnl > 0) { curW++; curL = 0; maxW = Math.max(maxW, curW); }
      else if (t.pnl < 0) { curL++; curW = 0; maxL = Math.max(maxL, curL); }
    }
    return { maxConsecutiveWins: maxW, maxConsecutiveLosses: maxL };
  }

  /** 计算夏普比率（简化版） */
  private _calcSharpe(returns: number[]): number {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    return std > 0 ? (mean / std) * Math.sqrt(252) : 0; // 年化
  }
}
