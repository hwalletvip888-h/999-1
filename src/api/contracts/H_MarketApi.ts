/**
 * H_MarketApi — 行情数据接口契约
 * 职责：实时行情、K 线、深度、资金费率
 */

/** K 线周期 */
export type H_KlinePeriod = '1m' | '5m' | '15m' | '1H' | '4H' | '1D' | '1W';

/** 单根 K 线 */
export interface H_Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 实时行情快照 */
export interface H_Ticker {
  instId: string;
  last: number;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
  vol24h: number;
  change24h: number;
  changePercent24h: number;
  timestamp: number;
}

/** 深度档位 */
export interface H_OrderBookLevel {
  price: number;
  size: number;
}

/** 深度数据 */
export interface H_OrderBook {
  instId: string;
  bids: H_OrderBookLevel[];
  asks: H_OrderBookLevel[];
  timestamp: number;
}

/** 资金费率 */
export interface H_FundingRate {
  instId: string;
  fundingRate: number;
  nextFundingRate: number;
  fundingTime: number;
}

/** H_MarketApi 接口定义 */
export interface IH_MarketApi {
  /** 获取实时行情 */
  getTicker(instId: string): Promise<H_Ticker>;
  /** 获取多个币种行情 */
  getTickers(instIds: string[]): Promise<H_Ticker[]>;
  /** 获取 K 线数据 */
  getCandles(instId: string, period: H_KlinePeriod, limit?: number): Promise<H_Candle[]>;
  /** 获取深度数据 */
  getOrderBook(instId: string, depth?: number): Promise<H_OrderBook>;
  /** 获取资金费率 */
  getFundingRate(instId: string): Promise<H_FundingRate>;
  /** 订阅实时行情推送（返回取消订阅函数） */
  subscribeTicker(instId: string, callback: (ticker: H_Ticker) => void): () => void;
}
