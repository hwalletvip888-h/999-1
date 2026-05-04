/**
 * H_MarketApi Mock 实现
 */

import type {
  IH_MarketApi,
  H_Ticker,
  H_Candle,
  H_OrderBook,
  H_FundingRate,
  H_KlinePeriod,
} from '../../contracts/H_MarketApi';

const MOCK_PRICES: Record<string, number> = {
  'BTC-USDT-SWAP': 67500,
  'ETH-USDT-SWAP': 3450,
  'SOL-USDT-SWAP': 178,
};

export class MockH_MarketApi implements IH_MarketApi {
  async getTicker(instId: string): Promise<H_Ticker> {
    const base = MOCK_PRICES[instId] || 100;
    const change = (Math.random() - 0.5) * base * 0.04;
    return {
      instId,
      last: base + change,
      bid: base + change - base * 0.0001,
      ask: base + change + base * 0.0001,
      high24h: base * 1.03,
      low24h: base * 0.97,
      vol24h: Math.round(Math.random() * 1000000),
      change24h: change,
      changePercent24h: (change / base) * 100,
      timestamp: Date.now(),
    };
  }

  async getTickers(instIds: string[]): Promise<H_Ticker[]> {
    return Promise.all(instIds.map((id) => this.getTicker(id)));
  }

  async getCandles(instId: string, _period: H_KlinePeriod, limit = 100): Promise<H_Candle[]> {
    const base = MOCK_PRICES[instId] || 100;
    const candles: H_Candle[] = [];
    let price = base;
    const now = Date.now();

    for (let i = limit - 1; i >= 0; i--) {
      const change = (Math.random() - 0.5) * price * 0.02;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * price * 0.005;
      const low = Math.min(open, close) - Math.random() * price * 0.005;
      candles.push({
        timestamp: now - i * 60000,
        open,
        high,
        low,
        close,
        volume: Math.round(Math.random() * 10000),
      });
      price = close;
    }
    return candles;
  }

  async getOrderBook(instId: string, depth = 10): Promise<H_OrderBook> {
    const base = MOCK_PRICES[instId] || 100;
    const bids = Array.from({ length: depth }, (_, i) => ({
      price: base - (i + 1) * base * 0.0001,
      size: Math.round(Math.random() * 100),
    }));
    const asks = Array.from({ length: depth }, (_, i) => ({
      price: base + (i + 1) * base * 0.0001,
      size: Math.round(Math.random() * 100),
    }));
    return { instId, bids, asks, timestamp: Date.now() };
  }

  async getFundingRate(instId: string): Promise<H_FundingRate> {
    return {
      instId,
      fundingRate: (Math.random() - 0.3) * 0.001,
      nextFundingRate: (Math.random() - 0.3) * 0.001,
      fundingTime: Date.now() + 3600000,
    };
  }

  subscribeTicker(instId: string, callback: (ticker: H_Ticker) => void): () => void {
    const interval = setInterval(async () => {
      const ticker = await this.getTicker(instId);
      callback(ticker);
    }, 3000);
    return () => clearInterval(interval);
  }
}
