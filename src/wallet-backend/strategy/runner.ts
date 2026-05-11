/**
 * Strategy Runner — 管理策略生命周期与真实执行日志
 * 每个 userId 只允许同时运行一个策略
 */

export type LogLevel = "info" | "action" | "success" | "warn" | "error";

export type StrategyLog = {
  ts: string;        // HH:MM:SS
  level: LogLevel;
  msg: string;
};

export type StrategyStatus = {
  running: boolean;
  strategyId: string | null;
  startedAt: number | null;
  logs: StrategyLog[];
};

// 内存存储（per-user）
const store = new Map<string, StrategyStatus>();
const timers = new Map<string, ReturnType<typeof setInterval>>();

function defaultStatus(): StrategyStatus {
  return { running: false, strategyId: null, startedAt: null, logs: [] };
}

export function getStatus(userId: string): StrategyStatus {
  return store.get(userId) ?? defaultStatus();
}

export function appendLog(userId: string, level: LogLevel, msg: string) {
  const st = store.get(userId) ?? defaultStatus();
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
  st.logs.push({ ts, level, msg });
  // 保留最近 200 条
  if (st.logs.length > 200) st.logs.splice(0, st.logs.length - 200);
  store.set(userId, st);
}

export function startStrategy(userId: string, strategyId: string, runFn: (userId: string) => void) {
  stopStrategy(userId);
  const st: StrategyStatus = { running: true, strategyId, startedAt: Date.now(), logs: [] };
  store.set(userId, st);
  appendLog(userId, "info", `策略「${strategyId}」已启动，开始监控市场...`);
  runFn(userId);
}

export function stopStrategy(userId: string) {
  const t = timers.get(userId);
  if (t) { clearInterval(t); timers.delete(userId); }
  const st = store.get(userId);
  if (st?.running) {
    st.running = false;
    store.set(userId, st);
    appendLog(userId, "warn", "策略已手动停止。");
  }
}

export function setTimer(userId: string, t: ReturnType<typeof setInterval>) {
  timers.set(userId, t);
}

export function clearTimer(userId: string) {
  const t = timers.get(userId);
  if (t) { clearInterval(t); timers.delete(userId); }
}

export function isRunning(userId: string): boolean {
  return store.get(userId)?.running ?? false;
}
