/**
 * H_SecurityApi — 安全扫描接口契约
 * 职责：合约风险评估 / 代币安全检测
 */

import type { H_Chain } from './H_WalletApi';

/** 风险等级 */
export type H_RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/** 代币安全报告 */
export interface H_TokenSecurityReport {
  chain: H_Chain;
  tokenAddress: string;
  tokenSymbol: string;
  riskLevel: H_RiskLevel;
  /** 风险评分 0-100（越高越安全） */
  safetyScore: number;
  /** 风险项列表 */
  risks: H_SecurityRiskItem[];
  /** 扫描时间 */
  scanTime: number;
}

/** 单项风险 */
export interface H_SecurityRiskItem {
  category: 'contract' | 'liquidity' | 'holder' | 'trading';
  title: string;
  description: string;
  severity: H_RiskLevel;
}

/** 授权检查结果 */
export interface H_ApprovalInfo {
  tokenAddress: string;
  spenderAddress: string;
  spenderName: string;
  allowance: number;
  riskLevel: H_RiskLevel;
}

/** H_SecurityApi 接口定义 */
export interface IH_SecurityApi {
  /** 扫描代币安全性 */
  scanToken(chain: H_Chain, tokenAddress: string): Promise<H_TokenSecurityReport>;
  /** 检查用户授权列表 */
  getApprovals(chain: H_Chain): Promise<H_ApprovalInfo[]>;
  /** 撤销授权 */
  revokeApproval(chain: H_Chain, tokenAddress: string, spenderAddress: string): Promise<{ txHash: string; success: boolean }>;
}
