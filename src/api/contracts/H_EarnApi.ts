/**
 * H_EarnApi — 链上赚币接口契约
 * 职责：质押 / 赎回 / 收益查询
 */

import type { H_Chain } from './H_WalletApi';

/** 赚币产品类型 */
export type H_EarnType = 'staking' | 'lending' | 'liquidity';

/** 赚币产品 */
export interface H_EarnProduct {
  productId: string;
  chain: H_Chain;
  type: H_EarnType;
  tokenSymbol: string;
  tokenAddress: string;
  /** 年化收益率（百分比） */
  apy: number;
  /** 最低投入 */
  minAmount: number;
  /** 锁定期（天，0 表示活期） */
  lockDays: number;
  /** TVL（USDT） */
  tvl: number;
  /** 协议名称 */
  protocol: string;
}

/** 用户持仓 */
export interface H_EarnPosition {
  productId: string;
  tokenSymbol: string;
  /** 投入本金 */
  principal: number;
  /** 累计收益 */
  earned: number;
  /** 当前 APY */
  currentApy: number;
  /** 到期时间（0 表示活期） */
  maturityTime: number;
  /** 开始时间 */
  startTime: number;
}

/** H_EarnApi 接口定义 */
export interface IH_EarnApi {
  /** 获取赚币产品列表 */
  getProducts(chain?: H_Chain, type?: H_EarnType): Promise<H_EarnProduct[]>;
  /** 质押/投入 */
  stake(productId: string, amount: number): Promise<{ txHash: string; success: boolean }>;
  /** 赎回 */
  redeem(productId: string, amount: number): Promise<{ txHash: string; success: boolean }>;
  /** 获取用户赚币持仓 */
  getPositions(): Promise<H_EarnPosition[]>;
  /** 获取累计收益 */
  getTotalEarnings(): Promise<number>;
}
