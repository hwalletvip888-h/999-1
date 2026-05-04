/**
 * marketFeed.ts — 行情订阅接口层
 *
 * ⚠️ 默认走 MockMarketFeed（前端自生成假行情）。
 *    要切到真实交易所，请在应用启动时调用 setMarketFeed(new BinanceMarketFeed({apiKey,...}))。
 *    真实模式仍只读，不会涉及下单 / 资金。
 */

export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export type Candle = {
  /** UNIX seconds */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type Tick = {
  symbol: string;
  price: number;
  ts: number;
};

export interface MarketFeed {
  /** 拉一次历史 K 线，可选 */
  fetchKlines?(symbol: string, interval: Interval, limit?: number): Promise<Candle[]>;
  /** 订阅最新 tick；返回取消函数 */
  subscribeTicks(symbol: string, cb: (tick: Tick) => void): () => void;
  /** 订阅 K 线增量（每根新 K 线生成时回调） */
  subscribeKlines?(symbol: string, interval: Interval, cb: (k: Candle) => void): () => void;
}

/* ─────────────────────────────────────────
   MockMarketFeed —— 默认实现
   ───────────────────────────────────────── */

export class MockMarketFeed implements MarketFeed {
  private prices = new Map<string, number>();

  private getOrInit(symbol: string): number {
    if (!this.prices.has(symbol)) {
      // 给常见币种一个合理初值
      const initial: Record<string, number> = {
        BTCUSDT: 78000,
        ETHUSDT: 4100,
        SOLUSDT: 215,
        BNBUSDT: 705
      };
      this.prices.set(symbol, initial[symbol.toUpperCase()] ?? 100);
    }
    return this.prices.get(symbol)!;
  }

  async fetchKlines(symbol: string, _interval: Interval, limit = 60): Promise<Candle[]> {
    const base = this.getOrInit(symbol);
    const out: Candle[] = [];
    let p = base;
    const now = Math.floor(Date.now() / 1000);
    for (let i = limit - 1; i >= 0; i--) {
      const o = p;
      const drift = (Math.random() - 0.48) * base * 0.004;
      p = Math.max(0.0001, p + drift);
      const c = p;
      const h = Math.max(o, c) * (1 + Math.random() * 0.0025);
      const l = Math.min(o, c) * (1 - Math.random() * 0.0025);
      out.push({ t: now - i * 60, o, h, l, c, v: Math.random() * 200 });
    }
    this.prices.set(symbol, p);
    return out;
  }

  subscribeTicks(symbol: string, cb: (tick: Tick) => void): () => void {
    const id = setInterval(() => {
      const cur = this.getOrInit(symbol);
      const drift = (Math.random() - 0.48) * cur * 0.0008;
      const next = Math.max(0.0001, cur + drift);
      this.prices.set(symbol, next);
      cb({ symbol, price: next, ts: Date.now() });
    }, 1000);
    return () => clearInterval(id);
  }
}

/* ─────────────────────────────────────────
   OKXMarketFeed —— 公开 WS + REST K 线
   ───────────────────────────────────────── */

import { getCandles, type OkxBar } from "./okxApi";

const OKX_INTERVAL_MAP: Record<Interval, OkxBar> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D"
};

/** BTCUSDT → BTC-USDT；BTC-USDT 原样保留 */
function toOkxInstId(symbol: string): string {
  if (symbol.includes("-")) return symbol.toUpperCase();
  const s = symbol.toUpperCase();
  // 常见 quote 后缀
  for (const quote of ["USDT", "USDC", "USD", "BTC", "ETH"]) {
    if (s.endsWith(quote) && s.length > quote.length) {
      return `${s.slice(0, -quote.length)}-${quote}`;
    }
  }
  return s;
}

export class OKXMarketFeed implements MarketFeed {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** 每个 instId 的订阅回调 */
  private tickSubs = new Map<string, Set<(t: Tick) => void>>();

  private ensureWs() {
    if (this.ws && this.ws.readyState <= 1) return;
    try {
      this.ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
    } catch (e) {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      // 重新订阅当前所有 instId
      const ids = Array.from(this.tickSubs.keys());
      if (ids.length) this.sendSubscribe(ids);
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        if (msg?.arg?.channel === "tickers" && Array.isArray(msg.data)) {
          for (const d of msg.data) {
            const subs = this.tickSubs.get(d.instId);
            if (!subs) continue;
            const tick: Tick = {
              symbol: d.instId,
              price: parseFloat(d.last),
              ts: parseInt(d.ts, 10) || Date.now()
            };
            subs.forEach((cb) => cb(tick));
          }
        }
      } catch {
        /* ignore */
      }
    };
    this.ws.onerror = () => {
      /* swallow — onclose 会跟着触发 */
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (this.tickSubs.size > 0) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureWs();
    }, 2500);
  }

  private sendSubscribe(instIds: string[]) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(
      JSON.stringify({
        op: "subscribe",
        args: instIds.map((id) => ({ channel: "tickers", instId: id }))
      })
    );
  }

  private sendUnsubscribe(instIds: string[]) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(
      JSON.stringify({
        op: "unsubscribe",
        args: instIds.map((id) => ({ channel: "tickers", instId: id }))
      })
    );
  }

  async fetchKlines(symbol: string, interval: Interval, limit = 100): Promise<Candle[]> {
    const id = toOkxInstId(symbol);
    return getCandles(id, OKX_INTERVAL_MAP[interval] ?? "1m", limit);
  }

  subscribeTicks(symbol: string, cb: (tick: Tick) => void): () => void {
    const id = toOkxInstId(symbol);
    let set = this.tickSubs.get(id);
    if (!set) {
      set = new Set();
      this.tickSubs.set(id, set);
      this.ensureWs();
      // 如果 ws 已经 open，直接订阅；onopen 里也会再订阅一次（无副作用）
      if (this.ws?.readyState === 1) this.sendSubscribe([id]);
    }
    set.add(cb);
    return () => {
      const cur = this.tickSubs.get(id);
      if (!cur) return;
      cur.delete(cb);
      if (cur.size === 0) {
        this.tickSubs.delete(id);
        this.sendUnsubscribe([id]);
        if (this.tickSubs.size === 0 && this.ws) {
          try {
            this.ws.close();
          } catch {
            /* ignore */
          }
          this.ws = null;
        }
      }
    };
  }
}

/* ─────────────────────────────────────────
   BinanceMarketFeed —— 真实 WS 占位实现（默认不启用）
   ───────────────────────────────────────── */

export type BinanceConfig = {
  /** 公开行情不需要 key；保留字段以便后续扩展私有数据 */
  apiKey?: string;
  apiSecret?: string;
  /** wss URL，默认 wss://stream.binance.com:9443 */
  wsBase?: string;
};

export class BinanceMarketFeed implements MarketFeed {
  constructor(private cfg: BinanceConfig = {}) {
    // TODO: 在用户提供凭证后接入。
    // 公开行情：wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_1m
    // 私有数据（账户余额、订单）需 listenKey + 签名。
    if (__DEV__) {
      console.info("[BinanceMarketFeed] stub created — 仍未连接真实 WebSocket");
    }
  }

  subscribeTicks(_symbol: string, _cb: (tick: Tick) => void): () => void {
    // TODO: new WebSocket(`${this.cfg.wsBase ?? "wss://stream.binance.com:9443"}/ws/${_symbol.toLowerCase()}@trade`)
    // 解析 e.data → { p: price, T: ts }
    return () => {
      /* noop */
    };
  }
}

/* ─────────────────────────────────────────
   单例切换
   ───────────────────────────────────────── */

let _feed: MarketFeed = new MockMarketFeed();

export function getMarketFeed(): MarketFeed {
  return _feed;
}

export function setMarketFeed(feed: MarketFeed) {
  _feed = feed;
}
