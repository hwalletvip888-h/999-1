/**
 * H_RiskApi OKX 实盘实现
 * 下单前风险评估 / 限额拦截 / 冷却期管理
 */

import type {
  IH_RiskApi,
  H_RiskCheckResult,
  H_RiskRule,
  H_RiskLimits,
} from '../../contracts/H_RiskApi';
import type { H_OpenPositionParams } from '../../contracts/H_PerpetualApi';
import type { H_CreateGridParams } from '../../contracts/H_GridApi';
// 平台中性层 — 走通用传输，不跟任一产品线绑定
import type { OkxCredentials } from './okxHttpCore';
import * as okxClient from './okxHttpCore';

/** 默认风控限额 */
const DEFAULT_LIMITS: H_RiskLimits = {
  maxSingleOrder: 5000,       // 单笔最大 5000 USDT
  maxDailyVolume: 50000,      // 单日最大 50000 USDT
  maxLeverage: 50,            // 最大 50x 杠杆
  maxPositions: 10,           // 最多 10 个持仓
  maxRiskPerTrade: 10,        // 单笔最大风险 10%
  cooldownPeriod: 1800,       // 冷却期 30 分钟
};

/** 运行时状态 */
let currentLimits: H_RiskLimits = { ...DEFAULT_LIMITS };
let lastLossTime: number = 0;
let consecutiveLosses: number = 0;
let dailyVolume: number = 0;
let dailyVolumeResetTime: number = 0;

export class OkxH_RiskApi implements IH_RiskApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  async checkOpenPosition(params: H_OpenPositionParams): Promise<H_RiskCheckResult> {
    const rules: H_RiskRule[] = [];

    // 重置日交易量（如果跨天）
    this._resetDailyIfNeeded();

    // 规则 1：单笔金额检查
    if (params.amount > currentLimits.maxSingleOrder) {
      rules.push({
        ruleId: 'MAX_SINGLE_ORDER',
        name: '单笔金额超限',
        description: `单笔金额 ${params.amount}U 超过限额 ${currentLimits.maxSingleOrder}U`,
        severity: 'block',
      });
    }

    // 规则 2：杠杆检查
    if (params.leverage > currentLimits.maxLeverage) {
      rules.push({
        ruleId: 'MAX_LEVERAGE',
        name: '杠杆超限',
        description: `杠杆 ${params.leverage}x 超过限额 ${currentLimits.maxLeverage}x`,
        severity: 'block',
      });
    }

    // 规则 3：日交易量检查
    if (dailyVolume + params.amount > currentLimits.maxDailyVolume) {
      rules.push({
        ruleId: 'MAX_DAILY_VOLUME',
        name: '日交易量超限',
        description: `今日累计交易量将超过 ${currentLimits.maxDailyVolume}U`,
        severity: 'warning',
      });
    }

    // 规则 4：持仓数量检查
    const posRes = await okxClient.request('GET', '/api/v5/account/positions?instType=SWAP', this.creds);
    const posCount = (posRes.data || []).length;
    if (posCount >= currentLimits.maxPositions) {
      rules.push({
        ruleId: 'MAX_POSITIONS',
        name: '持仓数量超限',
        description: `当前持仓 ${posCount} 个，已达上限 ${currentLimits.maxPositions}`,
        severity: 'block',
      });
    }

    // 规则 5：单笔风险比例检查
    const balRes = await okxClient.request('GET', '/api/v5/account/balance', this.creds);
    const totalEquity = parseFloat(balRes.data?.[0]?.totalEq || '0');
    if (totalEquity > 0) {
      const riskPct = (params.amount / totalEquity) * 100;
      if (riskPct > currentLimits.maxRiskPerTrade) {
        rules.push({
          ruleId: 'MAX_RISK_PER_TRADE',
          name: '单笔风险过高',
          description: `本次交易占总资产 ${riskPct.toFixed(1)}%，超过限额 ${currentLimits.maxRiskPerTrade}%`,
          severity: 'warning',
        });
      }
    }

    // 规则 6：冷却期检查
    const cooldown = await this.isInCooldown();
    if (cooldown.inCooldown) {
      rules.push({
        ruleId: 'COOLDOWN',
        name: '冷却期中',
        description: `连续亏损后冷却中，剩余 ${cooldown.remainingSeconds} 秒`,
        severity: 'block',
      });
    }

    // 汇总结果
    const hasBlock = rules.some((r) => r.severity === 'block');
    const hasWarning = rules.some((r) => r.severity === 'warning');

    return {
      passed: !hasBlock,
      riskLevel: hasBlock ? 'blocked' : hasWarning ? 'high' : rules.length > 0 ? 'medium' : 'low',
      triggeredRules: rules,
      requiresConfirmation: hasWarning && !hasBlock,
      message: hasBlock
        ? `风控拦截：${rules.filter((r) => r.severity === 'block').map((r) => r.name).join('、')}`
        : hasWarning
        ? `风险提示：${rules.filter((r) => r.severity === 'warning').map((r) => r.name).join('、')}，是否继续？`
        : '风控通过',
    };
  }

  async checkGrid(params: H_CreateGridParams): Promise<H_RiskCheckResult> {
    const rules: H_RiskRule[] = [];

    // 投入金额检查
    if (params.investment > currentLimits.maxSingleOrder * 2) {
      rules.push({
        ruleId: 'GRID_MAX_INVESTMENT',
        name: '网格投入超限',
        description: `网格投入 ${params.investment}U 超过限额`,
        severity: 'warning',
      });
    }

    // 网格数量合理性检查
    if (params.gridCount < 5 || params.gridCount > 200) {
      rules.push({
        ruleId: 'GRID_NUM_RANGE',
        name: '网格数量异常',
        description: `网格数量 ${params.gridCount} 不在合理范围 (5-200)`,
        severity: 'warning',
      });
    }

    const hasBlock = rules.some((r) => r.severity === 'block');
    const hasWarning = rules.some((r) => r.severity === 'warning');

    return {
      passed: !hasBlock,
      riskLevel: hasBlock ? 'blocked' : hasWarning ? 'medium' : 'low',
      triggeredRules: rules,
      requiresConfirmation: hasWarning,
      message: rules.length > 0
        ? `网格风控提示：${rules.map((r) => r.name).join('、')}`
        : '网格风控通过',
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
    if (consecutiveLosses < 3) {
      return { inCooldown: false, remainingSeconds: 0 };
    }
    const elapsed = (Date.now() - lastLossTime) / 1000;
    const remaining = currentLimits.cooldownPeriod - elapsed;
    if (remaining <= 0) {
      consecutiveLosses = 0;
      return { inCooldown: false, remainingSeconds: 0 };
    }
    return { inCooldown: true, remainingSeconds: Math.ceil(remaining) };
  }

  /** 记录亏损（由执行层调用） */
  recordLoss(): void {
    consecutiveLosses++;
    lastLossTime = Date.now();
  }

  /** 记录盈利（重置连续亏损） */
  recordWin(): void {
    consecutiveLosses = 0;
  }

  /** 记录交易量 */
  recordVolume(amount: number): void {
    this._resetDailyIfNeeded();
    dailyVolume += amount;
  }

  /** 重置日交易量 */
  private _resetDailyIfNeeded(): void {
    const today = new Date().setHours(0, 0, 0, 0);
    if (dailyVolumeResetTime < today) {
      dailyVolume = 0;
      dailyVolumeResetTime = today;
    }
  }
}
