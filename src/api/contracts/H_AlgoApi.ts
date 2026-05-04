/**
 * H_AlgoApi — 算法委托（策略订单）接口契约
 * 职责：追踪止损 / 条件委托 / 计划委托 / 追踪委托 / TWAP
 *
 * 对应 OKX V5 Algo Trading 系列接口：
 *   POST /api/v5/trade/order-algo
 *   POST /api/v5/trade/cancel-algos
 *   POST /api/v5/trade/amend-algos
 *   GET  /api/v5/trade/order-algo
 *   GET  /api/v5/trade/orders-algo-pending
 *   GET  /api/v5/trade/orders-algo-history
 */

// ─── 枚举 / 联合类型 ──────────────────────────────────────────

/** 算法委托类型 */
export type H_AlgoOrderType =
  | 'trailing_stop'    // move_order_stop — 追踪止损
  | 'conditional'      // conditional — 条件委托（止盈止损）
  | 'trigger'          // trigger — 计划委托
  | 'chase'            // chase — 追踪委托（仅 FUTURES/SWAP）
  | 'twap';            // twap — 时间加权

/** 算法委托状态 */
export type H_AlgoStatus =
  | 'live'             // 待触发
  | 'partially_effective' // 部分生效
  | 'effective'        // 已生效
  | 'canceled'         // 已撤销
  | 'order_failed';    // 委托失败

/** 触发价类型 */
export type H_TriggerPxType = 'last' | 'index' | 'mark';

/** 交易方向 */
export type H_AlgoSide = 'buy' | 'sell';

/** 持仓方向 */
export type H_AlgoPosSide = 'long' | 'short' | 'net';

// ─── 下单参数 ──────────────────────────────────────────────────

/** 追踪止损参数 */
export interface H_TrailingStopParams {
  instId: string;
  side: H_AlgoSide;
  posSide?: H_AlgoPosSide;
  /** 委托数量（张） */
  sz: string;
  /** 回调比例（如 0.05 = 5%），与 callbackSpread 二选一 */
  callbackRatio?: string;
  /** 回调幅度（固定价差），与 callbackRatio 二选一 */
  callbackSpread?: string;
  /** 激活价格（不填则立即激活） */
  activePx?: string;
  /** 是否只减仓 */
  reduceOnly?: boolean;
}

/** 条件委托（止盈止损）参数 */
export interface H_ConditionalParams {
  instId: string;
  side: H_AlgoSide;
  posSide?: H_AlgoPosSide;
  /** 委托数量（张） */
  sz: string;
  /** 止盈触发价 */
  tpTriggerPx?: string;
  /** 止盈触发价类型 */
  tpTriggerPxType?: H_TriggerPxType;
  /** 止盈委托价（-1 为市价） */
  tpOrdPx?: string;
  /** 止损触发价 */
  slTriggerPx?: string;
  /** 止损触发价类型 */
  slTriggerPxType?: H_TriggerPxType;
  /** 止损委托价（-1 为市价） */
  slOrdPx?: string;
  /** 是否关联持仓（true 时平仓自动撤单） */
  cxlOnClosePos?: boolean;
  /** 是否只减仓 */
  reduceOnly?: boolean;
}

/** 计划委托参数 */
export interface H_TriggerOrderParams {
  instId: string;
  side: H_AlgoSide;
  posSide?: H_AlgoPosSide;
  /** 委托数量（张） */
  sz: string;
  /** 触发价格 */
  triggerPx: string;
  /** 触发价类型 */
  triggerPxType?: H_TriggerPxType;
  /** 委托价格（-1 为市价） */
  orderPx: string;
  /** 是否只减仓 */
  reduceOnly?: boolean;
}

/** 追踪委托参数（仅 FUTURES/SWAP） */
export interface H_ChaseOrderParams {
  instId: string;
  side: H_AlgoSide;
  posSide?: H_AlgoPosSide;
  /** 委托数量（张） */
  sz: string;
  /** 是否只减仓 */
  reduceOnly?: boolean;
}

/** TWAP 时间加权参数 */
export interface H_TwapOrderParams {
  instId: string;
  side: H_AlgoSide;
  posSide?: H_AlgoPosSide;
  /** 委托数量（张） */
  sz: string;
  /** 单笔限额 */
  szLimit: string;
  /** 价格限制 */
  pxLimit: string;
  /** 时间间隔（秒） */
  timeInterval: string;
  /** 价格偏移 */
  pxSpread?: string;
}

/** 修改算法委托参数（仅支持 trigger / conditional） */
export interface H_AmendAlgoParams {
  algoId: string;
  instId: string;
  /** 新止盈触发价 */
  newTpTriggerPx?: string;
  /** 新止盈委托价 */
  newTpOrdPx?: string;
  /** 新止损触发价 */
  newSlTriggerPx?: string;
  /** 新止损委托价 */
  newSlOrdPx?: string;
  /** 新触发价（trigger 类型） */
  newTriggerPx?: string;
  /** 新委托价（trigger 类型） */
  newOrderPx?: string;
  /** 新委托数量 */
  newSz?: string;
}

// ─── 返回实体 ──────────────────────────────────────────────────

/** 算法委托订单 */
export interface H_AlgoOrder {
  /** 算法委托 ID */
  algoId: string;
  /** 客户端自定义 ID */
  algoClOrdId?: string;
  instId: string;
  /** 算法委托类型（标准化） */
  algoType: H_AlgoOrderType;
  /** OKX 原始 ordType */
  rawOrdType: string;
  side: H_AlgoSide;
  posSide: H_AlgoPosSide;
  /** 委托数量（张） */
  sz: string;
  /** 状态 */
  status: H_AlgoStatus;
  /** 杠杆倍数 */
  lever: string;
  // ── 追踪止损字段 ──
  callbackRatio?: string;
  callbackSpread?: string;
  activePx?: string;
  moveTriggerPx?: string;
  // ── 条件委托字段 ──
  tpTriggerPx?: string;
  tpOrdPx?: string;
  slTriggerPx?: string;
  slOrdPx?: string;
  // ── 计划委托字段 ──
  triggerPx?: string;
  orderPx?: string;
  // ── TWAP 字段 ──
  szLimit?: string;
  pxLimit?: string;
  timeInterval?: string;
  // ── 时间 ──
  createTime: number;
  triggerTime?: number;
}

// ─── 接口定义 ──────────────────────────────────────────────────

/** H_AlgoApi 接口定义 */
export interface IH_AlgoApi {
  /** 下追踪止损单 */
  placeTrailingStop(params: H_TrailingStopParams): Promise<H_AlgoOrder>;
  /** 下条件委托（止盈止损）单 */
  placeConditional(params: H_ConditionalParams): Promise<H_AlgoOrder>;
  /** 下计划委托单 */
  placeTriggerOrder(params: H_TriggerOrderParams): Promise<H_AlgoOrder>;
  /** 下追踪委托单（仅 FUTURES/SWAP） */
  placeChaseOrder(params: H_ChaseOrderParams): Promise<H_AlgoOrder>;
  /** 下 TWAP 时间加权单 */
  placeTwapOrder(params: H_TwapOrderParams): Promise<H_AlgoOrder>;
  /** 修改算法委托（仅 trigger / conditional） */
  amendAlgoOrder(params: H_AmendAlgoParams): Promise<boolean>;
  /** 撤销算法委托 */
  cancelAlgoOrder(algoId: string, instId: string): Promise<boolean>;
  /** 批量撤销算法委托 */
  cancelAlgoOrders(orders: Array<{ algoId: string; instId: string }>): Promise<boolean>;
  /** 获取单个算法委托详情 */
  getAlgoOrder(algoId: string): Promise<H_AlgoOrder>;
  /** 获取待触发算法委托列表 */
  getAlgoPendingOrders(
    ordType?: H_AlgoOrderType,
    instId?: string
  ): Promise<H_AlgoOrder[]>;
  /** 获取算法委托历史 */
  getAlgoHistory(
    ordType?: H_AlgoOrderType,
    instId?: string,
    limit?: number
  ): Promise<H_AlgoOrder[]>;
}
