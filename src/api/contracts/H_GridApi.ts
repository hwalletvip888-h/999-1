/**
 * H_GridApi — 网格策略接口契约
 * 职责：创建 / 停止 / 调参 / 状态监控
 */

/** 网格方向 */
export type H_GridDirection = 'neutral' | 'long' | 'short';

/** 网格状态 */
export type H_GridStatus = 'running' | 'stopped' | 'completed' | 'error';

/** 创建网格参数 */
export interface H_CreateGridParams {
  instId: string;
  direction: H_GridDirection;
  /** 投入金额（USDT） */
  investment: number;
  /** 杠杆倍数 */
  leverage: number;
  /** 价格上界 */
  upperPrice: number;
  /** 价格下界 */
  lowerPrice: number;
  /** 网格数量 */
  gridCount: number;
  /** 止盈触发价（可选） */
  takeProfitPrice?: number;
  /** 止损触发价（可选） */
  stopLossPrice?: number;
}

/** 网格实例信息 */
export interface H_GridInstance {
  gridId: string;
  instId: string;
  direction: H_GridDirection;
  status: H_GridStatus;
  investment: number;
  leverage: number;
  upperPrice: number;
  lowerPrice: number;
  gridCount: number;
  /** 已实现利润（USDT） */
  realizedPnl: number;
  /** 浮动盈亏（USDT） */
  unrealizedPnl: number;
  /** 总收益率 */
  totalReturn: number;
  /** 已成交网格次数 */
  filledGrids: number;
  /** 创建时间 */
  createTime: number;
  /** 运行时长（秒） */
  runningDuration: number;
}

/** H_GridApi 接口定义 */
export interface IH_GridApi {
  /** 创建网格策略 */
  createGrid(params: H_CreateGridParams): Promise<H_GridInstance>;
  /** 停止网格策略 */
  stopGrid(gridId: string): Promise<boolean>;
  /** 获取网格列表 */
  getGrids(status?: H_GridStatus): Promise<H_GridInstance[]>;
  /** 获取单个网格详情 */
  getGridDetail(gridId: string): Promise<H_GridInstance>;
  /** 调整网格参数（仅支持止盈止损调整） */
  adjustGrid(gridId: string, tp?: number, sl?: number): Promise<boolean>;
}
