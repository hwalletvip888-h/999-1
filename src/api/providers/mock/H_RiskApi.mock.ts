/**
 * H_RiskApi Mock 实现
 */

import type {
  IH_RiskApi,
  H_RiskCheckResult,
  H_RiskLimits,
} from '../../contracts/H_RiskApi';
import type { H_OpenPositionParams } from '../../contracts/H_PerpetualApi';
import type { H_CreateGridParams } from '../../contracts/H_GridApi';

const DEFAULT_LIMITS: H_RiskLimits = {
  maxSingleOrder: 5000,
  maxDailyVolume: 50000,
  maxLeverage: 20,
  maxPositions: 10,
  maxRiskPerTrade: 5,
  cooldownPeriod: 300,
};

let currentLimits = { ...DEFAULT_LIMITS };

export class MockH_RiskApi implements IH_RiskApi {
  async checkOpenPosition(params: H_OpenPositionParams): Promise<H_RiskCheckResult> {
    const rules = [];

    if (params.amount > currentLimits.maxSingleOrder) {
      rules.push({
        ruleId: 'max_single_order',
        name: '单笔限额',
        description: `单笔金额 ${params.amount} 超过限额 ${currentLimits.maxSingleOrder} USDT`,
        severity: 'block' as const,
      });
    }

    if (params.leverage > currentLimits.maxLeverage) {
      rules.push({
        ruleId: 'max_leverage',
        name: '杠杆限制',
        description: `杠杆 ${params.leverage}x 超过限制 ${currentLimits.maxLeverage}x`,
        severity: 'block' as const,
      });
    }

    if (params.leverage > 10) {
      rules.push({
        ruleId: 'high_leverage_warning',
        name: '高杠杆警告',
        description: `杠杆 ${params.leverage}x 属于高风险`,
        severity: 'warning' as const,
      });
    }

    const blocked = rules.some((r) => r.severity === 'block');
    const hasWarning = rules.some((r) => r.severity === 'warning');

    return {
      passed: !blocked,
      riskLevel: blocked ? 'blocked' : hasWarning ? 'medium' : 'low',
      triggeredRules: rules,
      requiresConfirmation: hasWarning && !blocked,
      message: blocked
        ? '风控拦截：' + rules.filter((r) => r.severity === 'block').map((r) => r.description).join('; ')
        : hasWarning
        ? '风险提示：' + rules.filter((r) => r.severity === 'warning').map((r) => r.description).join('; ')
        : '风控通过',
    };
  }

  async checkGrid(params: H_CreateGridParams): Promise<H_RiskCheckResult> {
    const rules = [];

    if (params.investment > currentLimits.maxSingleOrder * 2) {
      rules.push({
        ruleId: 'grid_max_investment',
        name: '网格投入限额',
        description: `网格投入 ${params.investment} 超过限额`,
        severity: 'block' as const,
      });
    }

    const blocked = rules.some((r) => r.severity === 'block');

    return {
      passed: !blocked,
      riskLevel: blocked ? 'blocked' : 'low',
      triggeredRules: rules,
      requiresConfirmation: false,
      message: blocked ? '风控拦截' : '风控通过',
    };
  }

  async getLimits(): Promise<H_RiskLimits> {
    return { ...currentLimits };
  }

  async updateLimits(limits: Partial<H_RiskLimits>): Promise<H_RiskLimits> {
    currentLimits = { ...currentLimits, ...limits };
    return { ...currentLimits };
  }

  async isInCooldown(): Promise<{ inCooldown: boolean; remainingSeconds: number }> {
    return { inCooldown: false, remainingSeconds: 0 };
  }
}
