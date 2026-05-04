/**
 * H_MarketApi OKX 实盘实现
 * 对接 OKX V5 公开行情接口，无需 API Key
 */

import type {
  IH_MarketApi,
  H_Ticker,
  H_Candle,
  H_OrderBook,
  H_FundingRate,
  H_KlinePeriod,
} from '../../contracts/H_MarketApi';
import * as okxClient from './okxClient';

export class OkxH_MarketApi implements IH_MarketApi {

  async getTicker(instId: string): Promise<H_Ticker> {
    const res = await okxClient.getTicker(instId);
    if (res.code !== '0' || !res.data?.[0]) {
      throw new Error(`[H_MarketApi] getTicker 失败: ${res.msg}`);
    }
    const d = res.data[0];
    const last = parseFloat(d.last);
    const open24h = parseFloat(d.open24h || d.sodUtc0);
    return {
      instId: d.instId,
      last,
      bid: parseFloat(d.bidPx),
      ask: parseFloat(d.askPx),
      high24h: parseFloat(d.high24h),
      low24h: parseFloat(d.low24h),
      vol24h: parseFloat(d.vol24h),
      change24h: last - open24h,
      changePercent24h: open24h > 0 ? ((last - open24h) / open24h) * 100 : 0,
      timestamp: parseInt(d.ts),
    };
  }

  async getTickers(instIds: string[]): Promise<H_Ticker[]> {
    // OKX 没有批量查询指定 instId 的接口，逐个查询
    // 如果数量多可以用 getAllTickers 然后过滤
    if (instIds.length > 5) {
      const res = await okxClient.getAllTickers();
      if (res.code !== '0') throw new Error(`[H_MarketApi] getTickers 失败: ${res.msg}`);
      const set = new Set(instIds);
      return (res.data || [])
        .filter((d: any) => set.has(d.instId))
        .map((d: any) => {
          const last = parseFloat(d.last);
          const open24h = parseFloat(d.open24h || d.sodUtc0);
          return {
            instId: d.instId,
            last,
            bid: parseFloat(d.bidPx),
            ask: parseFloat(d.askPx),
            high24h: parseFloat(d.high24h),
            low24h: parseFloat(d.low24h),
            vol24h: parseFloat(d.vol24h),
            change24h: last - open24h,
            changePercent24h: open24h > 0 ? ((last - open24h) / open24h) * 100 : 0,
            timestamp: parseInt(d.ts),
          };
        });
    }
    return Promise.all(instIds.map((id) => this.getTicker(id)));
  }

  async getCandles(instId: string, period: H_KlinePeriod, limit = 100): Promise<H_Candle[]> {
    const res = await okxClient.getCandles(instId, period, limit);
    if (res.code !== '0') throw new Error(`[H_MarketApi] getCandles 失败: ${res.msg}`);
    // OKX 返回格式: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    // 按时间倒序返回，需要 reverse
    return (res.data || []).reverse().map((c: any) => ({
      timestamp: parseInt(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  }

  async getOrderBook(instId: string, depth = 20): Promise<H_OrderBook> {
    const res = await okxClient.getOrderBook(instId, String(depth));
    if (res.code !== '0') throw new Error(`[H_MarketApi] getOrderBook 失败: ${res.msg}`);
    const d = res.data?.[0];
    return {
      instId,
      bids: (d?.bids || []).map((b: any) => ({ price: parseFloat(b[0]), size: parseFloat(b[1]) })),
      asks: (d?.asks || []).map((a: any) => ({ price: parseFloat(a[0]), size: parseFloat(a[1]) })),
      timestamp: parseInt(d?.ts || '0'),
    };
  }

  async getFundingRate(instId: string): Promise<H_FundingRate> {
    const res = await okxClient.getFundingRate(instId);
    if (res.code !== '0' || !res.data?.[0]) {
      throw new Error(`[H_MarketApi] getFundingRate 失败: ${res.msg}`);
    }
    const d = res.data[0];
    return {
      instId: d.instId,
      fundingRate: parseFloat(d.fundingRate),
      nextFundingRate: parseFloat(d.nextFundingRate || '0'),
      fundingTime: parseInt(d.fundingTime || '0'),
    };
  }

  subscribeTicker(instId: string, callback: (ticker: H_Ticker) => void): () => void {
    // 轮询实现（每 3 秒），后续可升级为 WebSocket
    let active = true;
    const poll = async () => {
      while (active) {
        try {
          const ticker = await this.getTicker(instId);
          if (active) callback(ticker);
        } catch (err) {
          console.warn(`[H_MarketApi] subscribeTicker 轮询失败:`, err);
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    };
    poll();
    return () => { active = false; };
  }
}
