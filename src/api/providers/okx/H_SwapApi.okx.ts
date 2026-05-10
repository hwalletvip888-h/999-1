/**
 * H_SwapApi OKX 实盘实现
 * 对接 OKX DEX Aggregator API
 * https://www.okx.com/docs-v5/en/#dex-aggregator
 */

import type {
  IH_SwapApi,
  H_SwapQuoteParams,
  H_SwapQuote,
  H_SwapResult,
} from '../../contracts/H_SwapApi';
import type { H_Chain } from '../../contracts/H_WalletApi';
// V6（链上赚币）严格不依赖 V5 客户端，统一走中性传输层
import type { OkxCredentials } from './okxClient';
import * as okxClient from './okxClient';

/** OKX DEX 链 ID 映射 */
const DEX_CHAIN_ID_MAP: Record<H_Chain, string> = {
  EVM: '1',
  Solana: '501',
  Bitcoin: '0',
};

export class OkxH_SwapApi implements IH_SwapApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  async getQuote(params: H_SwapQuoteParams): Promise<H_SwapQuote> {
    const chainId = DEX_CHAIN_ID_MAP[params.chain];
    const query = [
      `chainId=${chainId}`,
      `fromTokenAddress=${params.fromTokenAddress}`,
      `toTokenAddress=${params.toTokenAddress}`,
      `amount=${params.amount}`,
      `slippage=${params.slippage / 100}`, // OKX 接收小数形式
    ].join('&');

    const res = await okxClient.request(
      'GET',
      `/api/v5/dex/aggregator/quote?${query}`,
      this.creds
    );
    if (res.code !== '0') {
      throw new Error(`[H_SwapApi] getQuote 失败: ${res.msg}`);
    }
    const data = res.data?.[0] || {};
    return {
      fromToken: data.fromToken?.tokenSymbol || '',
      toToken: data.toToken?.tokenSymbol || '',
      fromAmount: parseFloat(data.fromTokenAmount || '0'),
      toAmount: parseFloat(data.toTokenAmount || '0'),
      rate: parseFloat(data.toTokenAmount || '0') / (parseFloat(data.fromTokenAmount || '1') || 1),
      estimatedGas: parseFloat(data.estimateGasFee || '0'),
      priceImpact: parseFloat(data.priceImpactPercentage || '0'),
      route: (data.routerList || []).map((r: any) => r.dexName || 'unknown'),
      validFor: 30,
      quoteId: data.quoteId || `quote_${Date.now()}`,
    };
  }

  async executeSwap(quoteId: string): Promise<H_SwapResult> {
    // OKX DEX swap 执行 — 需要通过 Agent Wallet 签名
    const res = await okxClient.request(
      'POST',
      '/api/v5/dex/aggregator/swap',
      this.creds,
      { quoteId }
    );
    if (res.code !== '0') {
      throw new Error(`[H_SwapApi] executeSwap 失败: ${res.msg}`);
    }
    const data = res.data?.[0] || {};
    return {
      txHash: data.txHash || '',
      status: 'pending',
      fromToken: data.fromToken?.tokenSymbol || '',
      toToken: data.toToken?.tokenSymbol || '',
      fromAmount: parseFloat(data.fromTokenAmount || '0'),
      toAmount: parseFloat(data.toTokenAmount || '0'),
      fee: parseFloat(data.gasFee || '0'),
      timestamp: Date.now(),
    };
  }

  async getSwapStatus(txHash: string): Promise<H_SwapResult> {
    const res = await okxClient.request(
      'GET',
      `/api/v5/dex/aggregator/transaction-status?txHash=${txHash}`,
      this.creds
    );
    if (res.code !== '0') {
      throw new Error(`[H_SwapApi] getSwapStatus 失败: ${res.msg}`);
    }
    const data = res.data?.[0] || {};
    const statusMap: Record<string, 'pending' | 'confirmed' | 'failed'> = {
      '1': 'pending',
      '2': 'confirmed',
      '3': 'failed',
    };
    return {
      txHash,
      status: statusMap[data.status] || 'pending',
      fromToken: data.fromTokenSymbol || '',
      toToken: data.toTokenSymbol || '',
      fromAmount: parseFloat(data.fromAmount || '0'),
      toAmount: parseFloat(data.toAmount || '0'),
      fee: parseFloat(data.gasFee || '0'),
      timestamp: parseInt(data.timestamp || '0'),
    };
  }

  async getSwapHistory(limit = 20): Promise<H_SwapResult[]> {
    const res = await okxClient.request(
      'GET',
      `/api/v5/dex/aggregator/history?limit=${limit}`,
      this.creds
    );
    if (res.code !== '0') {
      return []; // 历史可能为空
    }
    return (res.data || []).map((tx: any) => ({
      txHash: tx.txHash || '',
      status: tx.status === '2' ? 'confirmed' as const : tx.status === '3' ? 'failed' as const : 'pending' as const,
      fromToken: tx.fromTokenSymbol || '',
      toToken: tx.toTokenSymbol || '',
      fromAmount: parseFloat(tx.fromAmount || '0'),
      toAmount: parseFloat(tx.toAmount || '0'),
      fee: parseFloat(tx.gasFee || '0'),
      timestamp: parseInt(tx.timestamp || '0'),
    }));
  }

  async getSupportedTokens(chain: H_Chain): Promise<Array<{ symbol: string; address: string; decimals: number }>> {
    const chainId = DEX_CHAIN_ID_MAP[chain];
    const res = await okxClient.request(
      'GET',
      `/api/v5/dex/aggregator/all-tokens?chainId=${chainId}`,
      this.creds
    );
    if (res.code !== '0') {
      throw new Error(`[H_SwapApi] getSupportedTokens 失败: ${res.msg}`);
    }
    return (res.data || []).map((t: any) => ({
      symbol: t.tokenSymbol || '',
      address: t.tokenContractAddress || '',
      decimals: parseInt(t.decimals || '18'),
    }));
  }
}
