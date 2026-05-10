/**
 * marketFeed.ts — 行情订阅接口层
 *
 * ⚠️ 默认走 MockMarketFeed（前端自生成假行情）。
 *    切到 OKX：`setMarketFeed(new OKXMarketFeed())`（公开 WS + REST，与 OKX 文档一致）。
 *    切到 Binance：`setMarketFeed(new BinanceMarketFeed())`（公开 trade 流 + REST K 线，无需 key）。
 *    真实模式只读，不涉及下单 / 资金。
 */
import { getCandles, type OkxBar } from "./okxApi";
import { fetchWithDeadline } from "./fetchWithDeadline";
import { FETCH_TIMEOUT_MS } from "./hwalletHttpConstants";

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
   BinanceMarketFeed —— 公开 combined stream + REST K 线（仅公共接口）
   ───────────────────────────────────────── */

const BINANCE_INTERVAL: Record<Interval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

export type BinanceConfig = {
  /** 公开行情不需要 key；保留字段以便后续扩展 listenKey 等私有流 */
  apiKey?: string;
  apiSecret?: string;
  /** Spot 行情流 host，默认 `wss://stream.binance.com:9443`（Binance 公开文档） */
  wsBase?: string;
};

export class BinanceMarketFeed implements MarketFeed {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** key = BTCUSDT（大写、无横杠） */
  private tickSubs = new Map<string, Set<(t: Tick) => void>>();

  constructor(private cfg: BinanceConfig = {}) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.info("[BinanceMarketFeed] 公开 trade 合并流 + REST /api/v3/klines（无 listenKey）");
    }
  }

  private wsBaseUrl(): string {
    return (this.cfg.wsBase ?? "wss://stream.binance.com:9443").replace(/\/$/, "");
  }

  private normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase().replace(/-/g, "").replace(/\s+/g, "");
  }

  private streamFragmentForKey(key: string): string {
    return `${key.toLowerCase()}@trade`;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private detachWs() {
    if (!this.ws) return;
    try {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.tickSubs.size === 0) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openCombinedWs();
    }, 2500);
  }

  /** 按当前 tickSubs 重建 combined stream（Binance: `/stream?streams=a@trade/b@trade`） */
  private openCombinedWs() {
    this.clearReconnectTimer();
    this.detachWs();
    if (this.tickSubs.size === 0) return;

    const streams = [...this.tickSubs.keys()].map((k) => this.streamFragmentForKey(k)).join("/");
    const url = `${this.wsBaseUrl()}/stream?streams=${encodeURIComponent(streams)}`;

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onmessage = (ev) => {
      try {
        const outer = JSON.parse(typeof ev.data === "string" ? ev.data : "") as {
          stream?: string;
          data?: { e?: string; s?: string; p?: string; T?: number };
        };
        const d = outer.data;
        if (!d || d.e !== "trade" || !d.s || d.p == null) return;
        const sym = this.normalizeSymbol(d.s);
        const subs = this.tickSubs.get(sym);
        if (!subs) return;
        const tick: Tick = {
          symbol: sym,
          price: parseFloat(String(d.p)),
          ts: Number(d.T) || Date.now(),
        };
        subs.forEach((fn) => fn(tick));
      } catch {
        /* ignore */
      }
    };

    socket.onerror = () => {};
    socket.onclose = () => {
      this.ws = null;
      if (this.tickSubs.size > 0) this.scheduleReconnect();
    };
  }

  async fetchKlines(symbol: string, interval: Interval, limit = 100): Promise<Candle[]> {
    const sym = this.normalizeSymbol(symbol);
    const iv = BINANCE_INTERVAL[interval] ?? "1m";
    const lim = Math.min(Math.max(limit, 1), 1000);
    const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(iv)}&limit=${encodeURIComponent(String(lim))}`;
    try {
      const res = await fetchWithDeadline(
        url,
        { method: "GET", headers: { Accept: "application/json" } },
        FETCH_TIMEOUT_MS,
      );
      if (!res.ok) return [];
      const rows = (await res.json()) as unknown[];
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => {
        const r = row as unknown[];
        return {
          t: Math.floor(Number(r[0]) / 1000),
          o: parseFloat(String(r[1])),
          h: parseFloat(String(r[2])),
          l: parseFloat(String(r[3])),
          c: parseFloat(String(r[4])),
          v: parseFloat(String(r[5])),
        };
      });
    } catch {
      return [];
    }
  }

  subscribeTicks(symbol: string, cb: (tick: Tick) => void): () => void {
    const key = this.normalizeSymbol(symbol);
    const isNewInst = !this.tickSubs.has(key);
    let set = this.tickSubs.get(key);
    if (!set) {
      set = new Set();
      this.tickSubs.set(key, set);
    }
    set.add(cb);
    if (isNewInst) this.openCombinedWs();

    return () => {
      const cur = this.tickSubs.get(key);
      if (!cur) return;
      cur.delete(cb);
      let streamsChanged = false;
      if (cur.size === 0) {
        this.tickSubs.delete(key);
        streamsChanged = true;
      }
      if (this.tickSubs.size === 0) {
        this.clearReconnectTimer();
        this.detachWs();
      } else if (streamsChanged) {
        this.openCombinedWs();
      }
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
