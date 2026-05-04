/**
 * H_AnalyticsApi Mock 实现
 */

import type {
  IH_AnalyticsApi,
  H_TradingStats,
  H_CapitalUtilization,
  H_PortfolioSuggestion,
  H_RiskScore,
} from '../../contracts/H_AnalyticsApi';

export class MockH_AnalyticsApi implements IH_AnalyticsApi {
  async getTradingStats(_days = 30): Promise<H_TradingStats> {
    return {
      totalTrades: 48,
      winTrades: 29,
      lossTrades: 19,
      winRate: 0.604,
      totalPnl: 1850.30,
      avgWin: 125.50,
      avgLoss: -82.30,
      profitFactor: 2.33,
      maxDrawdown: 8.5,
      maxConsecutiveWins: 6,
      maxConsecutiveLosses: 3,
      sharpeRatio: 1.85,
    };
  }

  async getCapitalUtilization(): Promise<H_CapitalUtilization> {
    return {
      totalCapital: 25680.50,
      usedCapital: 7480.20,
      utilizationRate: 29.1,
      idleCapital: 18200.30,
    };
  }

  async getPortfolioSuggestions(): Promise<H_PortfolioSuggestion[]> {
    return [
      {
        type: 'increase_exposure',
        description: '当前资金利用率仅 29%，建议适当增加网格策略仓位',
        targets: ['BTC-USDT-SWAP', 'ETH-USDT-SWAP'],
        priority: 3,
        expectedImprovement: 5.2,
      },
      {
        type: 'rebalance',
        description: 'BTC 持仓占比过高（72%），建议分散到 ETH 和 SOL',
        targets: ['ETH-USDT-SWAP', 'SOL-USDT-SWAP'],
        priority: 2,
        expectedImprovement: 3.1,
      },
    ];
  }

  async getRiskScore(): Promise<H_RiskScore> {
    return {
      overall: 35,
      concentration: 55,
      leverage: 20,
      volatility: 40,
      liquidity: 15,
    };
  }

  async getEquityCurve(days = 30): Promise<Array<{ date: string; equity: number }>> {
    const curve: Array<{ date: string; equity: number }> = [];
    let equity = 24000;
    for (let i = days; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000);
      equity += (Math.random() - 0.4) * 200;
      curve.push({
        date: date.toISOString().split('T')[0],
        equity: Math.round(equity * 100) / 100,
      });
    }
    return curve;
  }
}
