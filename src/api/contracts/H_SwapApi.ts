/**
 * H_SwapApi — DEX 兑换接口契约
 * 职责：链上代币兑换（询价 / 执行 / 状态）
 */

import type { H_Chain } from './H_WalletApi';

/** 询价参数 */
export interface H_SwapQuoteParams {
  chain: H_Chain;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: number;
  /** 滑点容忍度（百分比，如 0.5 表示 0.5%） */
  slippage: number;
}

/** 询价结果 */
export interface H_SwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  /** 兑换率 */
  rate: number;
  /** 预估 Gas 费（USDT） */
  estimatedGas: number;
  /** 价格影响（百分比） */
  priceImpact: number;
  /** 路由路径 */
  route: string[];
  /** 报价有效期（秒） */
  validFor: number;
  /** 报价 ID（执行时需传入） */
  quoteId: string;
}

/** 兑换执行结果 */
export interface H_SwapResult {
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  fee: number;
  timestamp: number;
}

/** H_SwapApi 接口定义 */
export interface IH_SwapApi {
  /** 获取兑换报价 */
  getQuote(params: H_SwapQuoteParams): Promise<H_SwapQuote>;
  /** 执行兑换 */
  executeSwap(quoteId: string): Promise<H_SwapResult>;
  /** 查询兑换状态 */
  getSwapStatus(txHash: string): Promise<H_SwapResult>;
  /** 获取兑换历史 */
  getSwapHistory(limit?: number): Promise<H_SwapResult[]>;
  /** 获取支持的代币列表 */
  getSupportedTokens(chain: H_Chain): Promise<Array<{ symbol: string; address: string; decimals: number }>>;
}
