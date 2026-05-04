/**
 * H_PerpetualApi — 永续合约接口契约
 * 职责：开仓 / 平仓 / 止盈止损 / 持仓查询
 */

/** 方向 */
export type H_PositionSide = 'long' | 'short';

/** 订单类型 */
export type H_OrderType = 'market' | 'limit';

/** 订单状态 */
export type H_OrderStatus = 'pending' | 'filled' | 'partially_filled' | 'canceled' | 'failed';

/** 开仓参数 */
export interface H_OpenPositionParams {
  instId: string;
  side: H_PositionSide;
  orderType: H_OrderType;
  /** 投入金额（USDT） */
  amount: number;
  /** 杠杆倍数 */
  leverage: number;
  /** 限价单价格（orderType=limit 时必填） */
  price?: number;
  /** 止盈价格 */
  takeProfitPrice?: number;
  /** 止损价格 */
  stopLossPrice?: number;
}

/** 平仓参数 */
export interface H_ClosePositionParams {
  instId: string;
  side: H_PositionSide;
  /** 平仓比例 0-1，1 表示全部平仓 */
  ratio: number;
  orderType: H_OrderType;
  price?: number;
}

/** 持仓信息 */
export interface H_Position {
  instId: string;
  side: H_PositionSide;
  /** 持仓数量（张） */
  size: number;
  /** 开仓均价 */
  avgPrice: number;
  /** 当前标记价格 */
  markPrice: number;
  /** 未实现盈亏（USDT） */
  unrealizedPnl: number;
  /** 未实现盈亏百分比 */
  unrealizedPnlPercent: number;
  /** 杠杆倍数 */
  leverage: number;
  /** 强平价格 */
  liquidationPrice: number;
  /** 保证金（USDT） */
  margin: number;
  /** 开仓时间 */
  openTime: number;
}

/** 订单记录 */
export interface H_Order {
  orderId: string;
  instId: string;
  side: H_PositionSide;
  orderType: H_OrderType;
  status: H_OrderStatus;
  size: number;
  price: number;
  filledSize: number;
  filledPrice: number;
  pnl: number;
  fee: number;
  createTime: number;
  updateTime: number;
}

/** H_PerpetualApi 接口定义 */
export interface IH_PerpetualApi {
  /** 开仓 */
  openPosition(params: H_OpenPositionParams): Promise<H_Order>;
  /** 平仓 */
  closePosition(params: H_ClosePositionParams): Promise<H_Order>;
  /** 设置止盈止损 */
  setTpSl(instId: string, side: H_PositionSide, tp?: number, sl?: number): Promise<boolean>;
  /** 获取当前持仓列表 */
  getPositions(): Promise<H_Position[]>;
  /** 获取历史订单 */
  getOrders(instId?: string, limit?: number): Promise<H_Order[]>;
  /** 设置杠杆 */
  setLeverage(instId: string, leverage: number): Promise<boolean>;
}
