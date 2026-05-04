/**
 * H_RiskApi — 风控接口契约
 * 职责：下单前风险评估 / 限额拦截 / 二次确认
 */

import type { H_OpenPositionParams } from './H_PerpetualApi';
import type { H_CreateGridParams } from './H_GridApi';

/** 风控检查结果 */
export interface H_RiskCheckResult {
  /** 是否通过 */
  passed: boolean;
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high' | 'blocked';
  /** 风控规则触发列表 */
  triggeredRules: H_RiskRule[];
  /** 是否需要用户二次确认 */
  requiresConfirmation: boolean;
  /** 给用户的风险提示文案 */
  message: string;
}

/** 触发的风控规则 */
export interface H_RiskRule {
  ruleId: string;
  name: string;
  description: string;
  severity: 'warning' | 'block';
}

/** 风控限额配置 */
export interface H_RiskLimits {
  /** 单笔最大金额（USDT） */
  maxSingleOrder: number;
  /** 单日最大交易金额（USDT） */
  maxDailyVolume: number;
  /** 最大杠杆倍数 */
  maxLeverage: number;
  /** 最大持仓数量 */
  maxPositions: number;
  /** 单笔最大风险比例（占总资产百分比） */
  maxRiskPerTrade: number;
  /** 冷却期（秒，连续亏损后强制等待） */
  cooldownPeriod: number;
}

/** H_RiskApi 接口定义 */
export interface IH_RiskApi {
  /** 检查开仓风险 */
  checkOpenPosition(params: H_OpenPositionParams): Promise<H_RiskCheckResult>;
  /** 检查网格策略风险 */
  checkGrid(params: H_CreateGridParams): Promise<H_RiskCheckResult>;
  /** 获取当前风控限额 */
  getLimits(): Promise<H_RiskLimits>;
  /** 更新风控限额（用户自定义） */
  updateLimits(limits: Partial<H_RiskLimits>): Promise<H_RiskLimits>;
  /** 检查是否在冷却期 */
  isInCooldown(): Promise<{ inCooldown: boolean; remainingSeconds: number }>;
}
