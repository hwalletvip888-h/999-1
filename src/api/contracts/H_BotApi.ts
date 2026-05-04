/**
 * H_BotApi — 策略 Bot 管理接口契约
 * 职责：Signal Bot / DCA Bot 的创建、停止、监控、收益查询
 *
 * 对应 OKX V5 Trading Bot 系列接口：
 *   /api/v5/tradingBot/signal/*   — Signal Bot
 *   /api/v5/tradingBot/dca/*      — DCA Bot
 */

// ─── 枚举 / 联合类型 ──────────────────────────────────────────

/** Bot 类型 */
export type H_BotType = 'signal' | 'dca';

/** Bot 运行状态 */
export type H_BotStatus = 'running' | 'stopped' | 'stopping' | 'error';

/** Signal Bot 子订单方向 */
export type H_SignalSide = 'buy' | 'sell';

/** Signal Bot 子订单类型 */
export type H_SignalOrderType = 'market' | 'limit';

// ─── Signal Bot 参数 ──────────────────────────────────────────

/** 创建 Signal Bot 参数 */
export interface H_CreateSignalParams {
  /** 信号名称 */
  signalName: string;
  /** 交易对列表（如 ['BTC-USDT-SWAP', 'ETH-USDT-SWAP']） */
  instIds: string[];
  /** 杠杆倍数 */
  lever: string;
  /** 投入金额（USDT） */
  investAmt: string;
  /** 保证金模式 */
  mgnMode?: 'cross' | 'isolated';
}

/** Signal Bot 子订单参数 */
export interface H_SignalSubOrderParams {
  /** Signal Bot ID */
  signalId: string;
  instId: string;
  side: H_SignalSide;
  orderType: H_SignalOrderType;
  /** 委托数量（张） */
  sz: string;
  /** 限价单价格 */
  price?: string;
}

/** Signal Bot 平仓参数 */
export interface H_SignalCloseParams {
  /** Signal Bot ID */
  signalId: string;
  instId: string;
}

// ─── DCA Bot 参数 ──────────────────────────────────────────────

/** 创建 DCA Bot 参数 */
export interface H_CreateDcaParams {
  /** 交易对 */
  instId: string;
  /** 投入金额（USDT） */
  investAmt: string;
  /** 杠杆倍数 */
  lever: string;
  /** 方向 */
  side: 'buy' | 'sell';
  /** 首单金额 */
  firstOrderAmt: string;
  /** 加仓间隔（百分比，如 0.05 = 5%） */
  addPosInterval: string;
  /** 加仓倍数 */
  addPosMul: string;
  /** 止盈比例（如 0.1 = 10%） */
  tpRatio?: string;
  /** 止损比例 */
  slRatio?: string;
  /** 最大加仓次数 */
  maxAddPos?: string;
}

// ─── 返回实体 ──────────────────────────────────────────────────

/** Signal Bot 实例 */
export interface H_SignalBot {
  signalId: string;
  signalName: string;
  status: H_BotStatus;
  instIds: string[];
  lever: string;
  investAmt: string;
  /** 已实现盈亏（USDT） */
  realizedPnl: string;
  /** 浮动盈亏（USDT） */
  unrealizedPnl: string;
  /** 总收益率 */
  totalReturn: string;
  /** 创建时间 */
  createTime: number;
}

/** DCA Bot 实例 */
export interface H_DcaBot {
  algoId: string;
  instId: string;
  status: H_BotStatus;
  side: 'buy' | 'sell';
  lever: string;
  investAmt: string;
  /** 首单金额 */
  firstOrderAmt: string;
  /** 加仓间隔 */
  addPosInterval: string;
  /** 已加仓次数 */
  addPosCount: number;
  /** 已实现盈亏（USDT） */
  realizedPnl: string;
  /** 浮动盈亏（USDT） */
  unrealizedPnl: string;
  /** 总收益率 */
  totalReturn: string;
  /** 创建时间 */
  createTime: number;
}

/** Bot 收益统计 */
export interface H_BotPerformance {
  botId: string;
  botType: H_BotType;
  /** 总盈亏（USDT） */
  totalPnl: string;
  /** 总收益率 */
  totalReturn: string;
  /** 胜率 */
  winRate: string;
  /** 总交易次数 */
  totalTrades: number;
  /** 盈利次数 */
  winTrades: number;
  /** 亏损次数 */
  lossTrades: number;
  /** 最大回撤 */
  maxDrawdown: string;
  /** 运行时长（秒） */
  runningDuration: number;
}

// ─── 接口定义 ──────────────────────────────────────────────────

/** H_BotApi 接口定义 */
export interface IH_BotApi {
  // ── Signal Bot ──
  /** 创建 Signal Bot */
  createSignalBot(params: H_CreateSignalParams): Promise<H_SignalBot>;
  /** 下 Signal Bot 子订单 */
  placeSignalSubOrder(params: H_SignalSubOrderParams): Promise<boolean>;
  /** 撤销 Signal Bot 子订单 */
  cancelSignalSubOrder(signalId: string, instId: string): Promise<boolean>;
  /** Signal Bot 平仓 */
  closeSignalPosition(params: H_SignalCloseParams): Promise<boolean>;
  /** 停止 Signal Bot */
  stopSignalBot(signalId: string): Promise<boolean>;
  /** 获取 Signal Bot 列表 */
  getSignalBots(status?: H_BotStatus): Promise<H_SignalBot[]>;

  // ── DCA Bot ──
  /** 创建 DCA Bot */
  createDcaBot(params: H_CreateDcaParams): Promise<H_DcaBot>;
  /** 停止 DCA Bot */
  stopDcaBot(algoId: string): Promise<boolean>;
  /** 获取 DCA Bot 列表 */
  getDcaBots(status?: H_BotStatus): Promise<H_DcaBot[]>;

  // ── 通用监控 ──
  /** 获取 Bot 收益统计 */
  getBotPerformance(botId: string, botType: H_BotType): Promise<H_BotPerformance>;
}
