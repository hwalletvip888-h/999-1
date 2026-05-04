/**
 * H_SecurityApi OKX 实盘实现
 * 对接 OKX Token Security / Approval 检测 API
 */

import type {
  IH_SecurityApi,
  H_TokenSecurityReport,
  H_ApprovalInfo,
  H_SecurityRiskItem,
  H_RiskLevel,
} from '../../contracts/H_SecurityApi';
import type { H_Chain } from '../../contracts/H_WalletApi';
import type { OkxCredentials } from './okxClient';
import * as okxClient from './okxClient';

const CHAIN_ID_MAP: Record<H_Chain, string> = {
  EVM: '1',
  Solana: '501',
  Bitcoin: '0',
};

export class OkxH_SecurityApi implements IH_SecurityApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  async scanToken(chain: H_Chain, tokenAddress: string): Promise<H_TokenSecurityReport> {
    const chainId = CHAIN_ID_MAP[chain];
    const res = await okxClient.request(
      'GET',
      `/api/v5/dex/security/token?chainId=${chainId}&tokenContractAddress=${tokenAddress}`,
      this.creds
    );
    if (res.code !== '0') {
      throw new Error(`[H_SecurityApi] scanToken 失败: ${res.msg}`);
    }
    const data = res.data?.[0] || {};
    const risks: H_SecurityRiskItem[] = [];

    // 解析风险项
    if (data.isHoneypot === '1') {
      risks.push({ category: 'contract', title: '蜜罐合约', description: '该代币可能无法卖出', severity: 'critical' });
    }
    if (data.isProxy === '1') {
      risks.push({ category: 'contract', title: '可升级合约', description: '合约所有者可修改逻辑', severity: 'medium' });
    }
    if (data.isMintable === '1') {
      risks.push({ category: 'contract', title: '可增发', description: '代币可被无限增发', severity: 'high' });
    }
    if (parseFloat(data.holderConcentration || '0') > 50) {
      risks.push({ category: 'holder', title: '持仓集中', description: `前10持有者占比 ${data.holderConcentration}%`, severity: 'high' });
    }
    if (parseFloat(data.buyTax || '0') > 5 || parseFloat(data.sellTax || '0') > 5) {
      risks.push({ category: 'trading', title: '高交易税', description: `买入税 ${data.buyTax}% / 卖出税 ${data.sellTax}%`, severity: 'medium' });
    }

    // 计算安全评分
    const deductions = risks.reduce((sum, r) => {
      const penalty = { safe: 0, low: 5, medium: 15, high: 25, critical: 50 };
      return sum + penalty[r.severity];
    }, 0);
    const safetyScore = Math.max(0, 100 - deductions);

    const riskLevel: H_RiskLevel = safetyScore >= 80 ? 'safe'
      : safetyScore >= 60 ? 'low'
      : safetyScore >= 40 ? 'medium'
      : safetyScore >= 20 ? 'high'
      : 'critical';

    return {
      chain,
      tokenAddress,
      tokenSymbol: data.tokenSymbol || '',
      riskLevel,
      safetyScore,
      risks,
      scanTime: Date.now(),
    };
  }

  async getApprovals(chain: H_Chain): Promise<H_ApprovalInfo[]> {
    const chainId = CHAIN_ID_MAP[chain];
    const res = await okxClient.request(
      'GET',
      `/api/v5/dex/security/approvals?chainId=${chainId}`,
      this.creds
    );
    if (res.code !== '0') {
      return []; // 可能无授权记录
    }
    return (res.data || []).map((a: any) => ({
      tokenAddress: a.tokenContractAddress || '',
      spenderAddress: a.spenderAddress || '',
      spenderName: a.spenderName || 'Unknown',
      allowance: parseFloat(a.allowance || '0'),
      riskLevel: this._assessApprovalRisk(a),
    }));
  }

  async revokeApproval(
    chain: H_Chain,
    tokenAddress: string,
    spenderAddress: string
  ): Promise<{ txHash: string; success: boolean }> {
    const chainId = CHAIN_ID_MAP[chain];
    const res = await okxClient.request(
      'POST',
      '/api/v5/dex/security/revoke-approval',
      this.creds,
      { chainId, tokenContractAddress: tokenAddress, spenderAddress }
    );
    if (res.code !== '0') {
      throw new Error(`[H_SecurityApi] revokeApproval 失败: ${res.msg}`);
    }
    return {
      txHash: res.data?.[0]?.txHash || '',
      success: true,
    };
  }

  /** 评估授权风险等级 */
  private _assessApprovalRisk(approval: any): H_RiskLevel {
    const allowance = parseFloat(approval.allowance || '0');
    if (allowance === 0) return 'safe';
    if (approval.isVerified === '1') return 'low';
    if (allowance > 1e18) return 'high'; // 无限授权
    return 'medium';
  }
}
