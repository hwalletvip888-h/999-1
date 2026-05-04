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
  | "stake"; // 质押

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
};

export type AgentStatus = {
  id: string;
  state: "pending" | "running" | "paused" | "stopped" | "error";
  startedAt: number;
  totalPnl: number;
  todayPnl: number;
  trades: number;
  lastEvent?: string;
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
   LiveAgentRunner —— 真实下单占位（默认不启用）
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
  constructor(private cfg: LiveAgentConfig) {
    if (!cfg.enableRealOrders) {
      console.warn("[LiveAgentRunner] enableRealOrders=false，将不会真正下单");
    }
    if (__DEV__) {
      toastBus.push({
        emoji: "⚠️",
        title: "Live Agent 已加载（占位）",
        subtitle: "未对接真实 API，仍为只读骨架",
        tone: "warn"
      });
    }
  }

  async start(_params: AgentParams): Promise<AgentStatus> {
    // TODO: 用 cfg.exchange 调对应 SDK 下单。下单前需:
    //  1) 用户在 Profile 内填入 API key
    //  2) 弹窗二次确认 "金额/方向/标的"
    //  3) cfg.enableRealOrders === true
    //  4) 错误时立刻停止并 toastBus.push 警告
    throw new Error("LiveAgentRunner.start 尚未实现 — 等待用户提供交易所凭证");
  }
  async stop() {
    /* TODO */
  }
  getStatus() {
    return null;
  }
  list() {
    return [];
  }
  subscribe(_cb: (s: AgentStatus) => void) {
    return () => {
      /* noop */
    };
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
