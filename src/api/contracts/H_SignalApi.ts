/**
 * H_SignalApi — 交易信号接口契约
 * 职责：封装各技术指标信号（MACD/RSI/EMA/BB），独立可组合
 */

/** 信号方向 */
export type H_SignalDirection = 'bullish' | 'bearish' | 'neutral';

/** 单个指标信号 */
export interface H_IndicatorSignal {
  /** 指标名称 */
  name: 'EMA' | 'RSI' | 'MACD' | 'BB' | 'FUNDING_RATE';
  /** 信号方向 */
  direction: H_SignalDirection;
  /** 信号强度分值 */
  score: number;
  /** 指标当前数值 */
  value: Record<string, number>;
  /** 信号描述 */
  description: string;
}

/** 综合信号结果 */
export interface H_CompositeSignal {
  instId: string;
  /** 综合评分（正=做多，负=做空） */
  totalScore: number;
  /** 建议方向 */
  direction: H_SignalDirection;
  /** 各指标明细 */
  indicators: H_IndicatorSignal[];
  /** 建议操作 */
  suggestion: 'open_long' | 'open_short' | 'hold' | 'close';
  /** 置信度 0-1 */
  confidence: number;
  /** 计算时间 */
  timestamp: number;
}

/** H_SignalApi 接口定义 */
export interface IH_SignalApi {
  /** 获取单个指标信号 */
  getIndicator(instId: string, indicator: H_IndicatorSignal['name']): Promise<H_IndicatorSignal>;
  /** 获取综合信号（多指标共振） */
  getCompositeSignal(instId: string): Promise<H_CompositeSignal>;
  /** 批量获取多币种综合信号 */
  getSignals(instIds: string[]): Promise<H_CompositeSignal[]>;
}
