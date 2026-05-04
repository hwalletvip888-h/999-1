/**
 * H_AccountApi Mock 实现
 */

import type {
  IH_AccountApi,
  H_AccountOverview,
  H_AssetBalance,
  H_PnlRecord,
} from '../../contracts/H_AccountApi';

export class MockH_AccountApi implements IH_AccountApi {
  async getOverview(): Promise<H_AccountOverview> {
    return {
      totalEquity: 25680.50,
      availableBalance: 18200.30,
      usedMargin: 7480.20,
      unrealizedPnl: 320.15,
      marginRatio: 0.29,
      balances: [
        { currency: 'USDT', available: 18200.30, frozen: 7480.20, total: 25680.50, usdtValue: 25680.50 },
        { currency: 'BTC', available: 0.05, frozen: 0, total: 0.05, usdtValue: 3375 },
      ],
      updateTime: Date.now(),
    };
  }

  async getBalance(currency: string): Promise<H_AssetBalance> {
    if (currency === 'USDT') {
      return { currency: 'USDT', available: 18200.30, frozen: 7480.20, total: 25680.50, usdtValue: 25680.50 };
    }
    return { currency, available: 0, frozen: 0, total: 0, usdtValue: 0 };
  }

  async getPnlHistory(days = 30): Promise<H_PnlRecord[]> {
    const records: H_PnlRecord[] = [];
    let cumulative = 0;
    for (let i = days; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000);
      const pnl = (Math.random() - 0.4) * 200;
      cumulative += pnl;
      records.push({
        date: date.toISOString().split('T')[0],
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round((pnl / 25000) * 10000) / 100,
        cumulativePnl: Math.round(cumulative * 100) / 100,
      });
    }
    return records;
  }

  async transfer(_currency: string, _amount: number, _direction: 'toTrade' | 'toFunding'): Promise<boolean> {
    return true;
  }
}
