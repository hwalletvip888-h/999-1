/**
 * agentRunner.ts — 自动化 Agent 执行接口层
 *
 * ⚠️ 默认走 MockAgentRunner（前端模拟运行 + 假盈亏）。
 *    要切到真实下单，请提供 LiveAgentRunner 凭证并 setAgentRunner(...)。
 *    真实模式涉及"真金白银"，必须显式开启 + 二次确认。
 */

import { toastBus } from "./toastBus";

export type AgentStrategy =
  | "grid" // 网格
  | "dca" // 定投
  | "trend" // 趋势跟随
  | "stake" // 质押
  | "perpetual"; // 永续合约

export type AgentParams = {
  strategy: AgentStrategy;
  symbol: string; // e.g. BTCUSDT
  /** 投入金额（USDT） */
  capital: number;
  /** 预期年化（参考） */
  apr?: number;
  /** 价格区间（grid 用） */
  rangeLow?: number;
  rangeHigh?: number;
  /** 网格数 */
  gridCount?: number;
  /** 标签（展示用） */
  label?: string;

  // ─── LiveAgentRunner 使用的扩展字段 ───
  /** 策略类型（用于 OKX V5 真实下单路由） */
  type?: "grid" | "perpetual" | "dca";
  /** OKX 交易对 ID，如 BTC-USDT / BTC-USDT-SWAP */
  instId?: string;
  /** 网格最高价 */
  maxPrice?: string;
  /** 网格最低价 */
  minPrice?: string;
  /** 网格数量 */
  gridNum?: string;
  /** 下单数量 */
  amount?: string;
  /** 方向 buy/sell */
  side?: "buy" | "sell";
};

export type AgentStatus = {
  id: string;
  state: "pending" | "running" | "paused" | "stopped" | "error";
  startedAt: number;
  totalPnl: number;
  todayPnl: number;
  trades: number;
  lastEvent?: string;

  // ─── LiveAgentRunner 使用的扩展字段 ───
  /** 策略类型 */
  type?: string;
  /** 交易对 */
  instId?: string;
  /** 运行状态（兼容 LiveAgentRunner 的 status 字段） */
  status?: "running" | "stopped" | "error";
  /** 启动时间戳（兼容 LiveAgentRunner） */
  startTime?: number;
  /** 盈亏 */
  pnl?: number;
  /** OKX 订单 ID */
  orderId?: string;
};

export interface AgentRunner {
  start(params: AgentParams): Promise<AgentStatus>;
  stop(id: string): Promise<void>;
  getStatus(id: string): AgentStatus | null;
  list(): AgentStatus[];
  /** 订阅状态变化 */
  subscribe(cb: (s: AgentStatus) => void): () => void;
}

/* ─────────────────────────────────────────
   MockAgentRunner —— 默认实现
   ───────────────────────────────────────── */

export class MockAgentRunner implements AgentRunner {
  private agents = new Map<string, AgentStatus>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private listeners = new Set<(s: AgentStatus) => void>();

  async start(params: AgentParams): Promise<AgentStatus> {
    const id = `agent_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const status: AgentStatus = {
      id,
      state: "running",
      startedAt: Date.now(),
      totalPnl: 0,
      todayPnl: 0,
      trades: 0,
      lastEvent: `${params.strategy.toUpperCase()} 已启动 · ${params.capital} U`
    };
    this.agents.set(id, status);
    this.emit(status);

    // 模拟运行：每 3s 出一次假数据
    const t = setInterval(() => {
      const cur = this.agents.get(id);
      if (!cur || cur.state !== "running") return;
      const sign = Math.random() < 0.7 ? 1 : -1;
      const delta = +(sign * (Math.random() * 0.18 + 0.02)).toFixed(2);
      cur.totalPnl = +(cur.totalPnl + delta).toFixed(2);
      cur.todayPnl = +(cur.todayPnl + delta).toFixed(2);
      if (Math.random() < 0.4) cur.trades += 1;
      cur.lastEvent =
        delta > 0
          ? `+${delta} U · ${params.symbol} 平仓`
          : `${delta} U · 网格补单`;
      this.emit(cur);
    }, 3000);
    this.timers.set(id, t);
    return status;
  }

  async stop(id: string) {
    const cur = this.agents.get(id);
    if (!cur) return;
    cur.state = "stopped";
    cur.lastEvent = "已停止";
    const t = this.timers.get(id);
    if (t) clearInterval(t);
    this.timers.delete(id);
    this.emit(cur);
  }

  getStatus(id: string) {
    return this.agents.get(id) ?? null;
  }

  list() {
    return Array.from(this.agents.values());
  }

  subscribe(cb: (s: AgentStatus) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(s: AgentStatus) {
    this.listeners.forEach((fn) => fn(s));
  }
}

/* ─────────────────────────────────────────
   LiveAgentRunner —— 真实 OKX V5 下单
   ───────────────────────────────────────── */

export type LiveAgentConfig = {
  exchange: "binance" | "okx" | "bybit";
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  /** 必须显式 = true 才允许真实下单 */
  enableRealOrders: boolean;
};

export class LiveAgentRunner implements AgentRunner {
  private activeAgents: Map<string, AgentStatus> = new Map();
  private listeners: Set<(s: AgentStatus) => void> = new Set();

  constructor(private cfg: LiveAgentConfig) {
    if (!cfg.enableRealOrders) {
      console.warn("[LiveAgentRunner] enableRealOrders=false，将不会真正下单");
    }
    console.log(`[LiveAgentRunner] 已初始化 exchange=${cfg.exchange}`);
  }

  async start(params: AgentParams): Promise<AgentStatus> {
    if (!this.cfg.enableRealOrders) {
      throw new Error("真实下单未启用 — 请在设置中开启 enableRealOrders");
    }

    const { api } = require("../api/gateway");
    const id = `agent_${Date.now()}`;

    try {
      let result: any;

      if (params.type === "grid") {
        result = await api.grid.placeGridOrder({
          instId: params.instId || "BTC-USDT",
          algoOrdType: "grid",
          maxPx: params.maxPrice || "100000",
          minPx: params.minPrice || "60000",
          gridNum: params.gridNum || "20",
          runType: "1",
          sz: params.amount || "100",
        });
      } else if (params.type === "perpetual") {
        result = await api.perpetual.placeOrder({
          instId: params.instId || "BTC-USDT-SWAP",
          tdMode: "cross",
          side: params.side || "buy",
          ordType: "market",
          sz: params.amount || "1",
          posSide: params.side === "sell" ? "short" : "long",
        });
      } else if (params.type === "dca") {
        result = await api.perpetual.placeOrder({
          instId: params.instId || "BTC-USDT-SWAP",
          tdMode: "cross",
          side: "buy",
          ordType: "market",
          sz: params.amount || "1",
          posSide: "long",
        });
      }

      const status: AgentStatus = {
        id,
        state: "running",
        startedAt: Date.now(),
        totalPnl: 0,
        todayPnl: 0,
        trades: 0,
        type: params.type,
        instId: params.instId || "BTC-USDT",
        status: "running",
        startTime: Date.now(),
        pnl: 0,
        orderId: result?.ordId || result?.algoId || "",
      };

      this.activeAgents.set(id, status);
      this.notify(status);

      toastBus.push({
        emoji: "\u2705",
        title: "策略已启动",
        subtitle: `${params.type} | ${params.instId || "BTC-USDT"}`,
        tone: "success"
      });

      return status;
    } catch (err: any) {
      toastBus.push({
        emoji: "\u274C",
        title: "策略启动失败",
        subtitle: err.message || "未知错误",
        tone: "warn"
      });
      throw err;
    }
  }

  async stop(agentId?: string) {
    if (agentId) {
      const agent = this.activeAgents.get(agentId);
      if (agent) {
        agent.state = "stopped";
        agent.status = "stopped";
        this.notify(agent);
        this.activeAgents.delete(agentId);
      }
    } else {
      for (const [, agent] of this.activeAgents) {
        agent.state = "stopped";
        agent.status = "stopped";
        this.notify(agent);
      }
      this.activeAgents.clear();
    }
  }

  getStatus(id?: string) {
    if (id) {
      return this.activeAgents.get(id) ?? null;
    }
    const agents = Array.from(this.activeAgents.values());
    return agents.length > 0 ? agents[0] : null;
  }

  list() {
    return Array.from(this.activeAgents.values());
  }

  subscribe(cb: (s: AgentStatus) => void) {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private notify(status: AgentStatus) {
    this.listeners.forEach(cb => cb(status));
  }
}

/* ─────────────────────────────────────────
   单例切换
   ───────────────────────────────────────── */

let _runner: AgentRunner = new MockAgentRunner();

export function getAgentRunner(): AgentRunner {
  return _runner;
}

export function setAgentRunner(r: AgentRunner) {
  _runner = r;
}
