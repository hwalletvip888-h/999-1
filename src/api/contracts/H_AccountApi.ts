/**
 * H_AccountApi — 账户资产接口契约
 * 职责：资金账户余额、保证金、盈亏统计
 */

/** 单币种余额 */
export interface H_AssetBalance {
  currency: string;
  available: number;
  frozen: number;
  total: number;
  /** 折合 USDT */
  usdtValue: number;
}

/** 账户总览 */
export interface H_AccountOverview {
  /** 总资产（USDT） */
  totalEquity: number;
  /** 可用余额（USDT） */
  availableBalance: number;
  /** 已用保证金（USDT） */
  usedMargin: number;
  /** 未实现盈亏（USDT） */
  unrealizedPnl: number;
  /** 保证金率 */
  marginRatio: number;
  /** 各币种余额明细 */
  balances: H_AssetBalance[];
  /** 更新时间 */
  updateTime: number;
}

/** 盈亏记录 */
export interface H_PnlRecord {
  date: string;
  pnl: number;
  pnlPercent: number;
  /** 累计盈亏 */
  cumulativePnl: number;
}

/** H_AccountApi 接口定义 */
export interface IH_AccountApi {
  /** 获取账户总览 */
  getOverview(): Promise<H_AccountOverview>;
  /** 获取单币种余额 */
  getBalance(currency: string): Promise<H_AssetBalance>;
  /** 获取历史盈亏记录 */
  getPnlHistory(days?: number): Promise<H_PnlRecord[]>;
  /** 资金划转（交易账户 ↔ 资金账户） */
  transfer(currency: string, amount: number, direction: 'toTrade' | 'toFunding'): Promise<boolean>;
}
