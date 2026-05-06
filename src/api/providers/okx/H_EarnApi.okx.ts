/**
 * H_EarnApi OKX 实盘实现
 * 对接 OKX Earn / DeFi Staking API
 * https://www.okx.com/docs-v5/en/#earn
 */

import type {
  IH_EarnApi,
  H_EarnProduct,
  H_EarnPosition,
  H_EarnType,
} from '../../contracts/H_EarnApi';
import type { H_Chain } from '../../contracts/H_WalletApi';
// V6（链上赚币）严格不依赖 V5 客户端，统一走中性传输层
import type { OkxCredentials } from './okxHttpCore';
import * as okxClient from './okxHttpCore';

export class OkxH_EarnApi implements IH_EarnApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  async getProducts(chain?: H_Chain, type?: H_EarnType): Promise<H_EarnProduct[]> {
    // OKX Earn 产品列表
    const params: string[] = [];
    if (type === 'staking') params.push('protocolType=staking');
    if (type === 'lending') params.push('protocolType=defi');

    const query = params.length > 0 ? `?${params.join('&')}` : '';
    const res = await okxClient.request(
      'GET',
      `/api/v5/finance/staking-defi/offers${query}`,
      this.creds
    );
    if (res.code !== '0') {
      throw new Error(`[H_EarnApi] getProducts 失败: ${res.msg}`);
    }

    return (res.data || []).map((p: any) => ({
      productId: p.productId || p.ccy || '',
      chain: this._mapChain(p.network || 'ETH'),
      type: this._mapType(p.protocolType || 'staking'),
      tokenSymbol: p.ccy || '',
      tokenAddress: p.tokenAddress || '',
      apy: parseFloat(p.apy || p.rate || '0') * 100,
      minAmount: parseFloat(p.minAmt || '0'),
      lockDays: parseInt(p.term || '0'),
      tvl: parseFloat(p.tvl || '0'),
      protocol: p.protocol || p.protocolType || 'OKX',
    })).filter((p: H_EarnProduct) => !chain || p.chain === chain);
  }

  async stake(productId: string, amount: number): Promise<{ txHash: string; success: boolean }> {
    const res = await okxClient.request(
      'POST',
      '/api/v5/finance/staking-defi/purchase',
      this.creds,
      {
        productId,
        investData: [{ ccy: '', amt: String(amount) }],
      }
    );
    if (res.code !== '0') {
      throw new Error(`[H_EarnApi] stake 失败: ${res.msg}`);
    }
    return {
      txHash: res.data?.[0]?.ordId || `earn_${Date.now()}`,
      success: true,
    };
  }

  async redeem(productId: string, amount: number): Promise<{ txHash: string; success: boolean }> {
    const res = await okxClient.request(
      'POST',
      '/api/v5/finance/staking-defi/redeem',
      this.creds,
      {
        productId,
        redeemData: [{ amt: String(amount) }],
      }
    );
    if (res.code !== '0') {
      throw new Error(`[H_EarnApi] redeem 失败: ${res.msg}`);
    }
    return {
      txHash: res.data?.[0]?.ordId || `redeem_${Date.now()}`,
      success: true,
    };
  }

  async getPositions(): Promise<H_EarnPosition[]> {
    const res = await okxClient.request(
      'GET',
      '/api/v5/finance/staking-defi/orders-active',
      this.creds
    );
    if (res.code !== '0') {
      throw new Error(`[H_EarnApi] getPositions 失败: ${res.msg}`);
    }
    return (res.data || []).map((p: any) => ({
      productId: p.productId || '',
      tokenSymbol: p.ccy || '',
      principal: parseFloat(p.investAmt || '0'),
      earned: parseFloat(p.earningData?.[0]?.earnings || p.earnings || '0'),
      currentApy: parseFloat(p.apy || p.rate || '0') * 100,
      maturityTime: parseInt(p.expTime || '0'),
      startTime: parseInt(p.purchasedTime || '0'),
    }));
  }

  async getTotalEarnings(): Promise<number> {
    const positions = await this.getPositions();
    return positions.reduce((sum, p) => sum + p.earned, 0);
  }

  /** 内部工具：网络名 → H_Chain */
  private _mapChain(network: string): H_Chain {
    const n = network.toLowerCase();
    if (n.includes('sol')) return 'Solana';
    if (n.includes('btc') || n.includes('bitcoin')) return 'Bitcoin';
    return 'EVM';
  }

  /** 内部工具：协议类型 → H_EarnType */
  private _mapType(protocolType: string): H_EarnType {
    switch (protocolType.toLowerCase()) {
      case 'staking': return 'staking';
      case 'lending':
      case 'defi': return 'lending';
      case 'liquidity': return 'liquidity';
      default: return 'staking';
    }
  }
}
