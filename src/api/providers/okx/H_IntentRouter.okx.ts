/**
 * H_IntentRouter OKX 实盘实现
 * 将 AI 识别的 Intent 路由到对应的 H_ API 模块
 */

import type {
  IH_IntentRouter,
  H_ExecutionPlan,
} from '../../contracts/H_IntentRouter';
import type { H_Intent } from '../../contracts/H_AIEngine';

/** 路由映射表：意图类型 → 目标 API + 方法 */
const ROUTE_MAP: Record<H_Intent['type'], { targetApi: string; method: string; requiresRiskCheck: boolean; requiresConfirmation: boolean }> = {
  market_query: { targetApi: 'market', method: 'getTicker', requiresRiskCheck: false, requiresConfirmation: false },
  open_position: { targetApi: 'perpetual', method: 'openPosition', requiresRiskCheck: true, requiresConfirmation: true },
  close_position: { targetApi: 'perpetual', method: 'closePosition', requiresRiskCheck: false, requiresConfirmation: true },
  grid_create: { targetApi: 'grid', method: 'createGrid', requiresRiskCheck: true, requiresConfirmation: true },
  grid_stop: { targetApi: 'grid', method: 'stopGrid', requiresRiskCheck: false, requiresConfirmation: true },
  swap: { targetApi: 'swap', method: 'executeSwap', requiresRiskCheck: true, requiresConfirmation: true },
  earn: { targetApi: 'earn', method: 'stake', requiresRiskCheck: false, requiresConfirmation: true },
  transfer: { targetApi: 'wallet', method: 'transfer', requiresRiskCheck: true, requiresConfirmation: true },
  balance_query: { targetApi: 'account', method: 'getOverview', requiresRiskCheck: false, requiresConfirmation: false },
  risk_check: { targetApi: 'risk', method: 'assessPortfolioRisk', requiresRiskCheck: false, requiresConfirmation: false },
  trend_query: { targetApi: 'market', method: 'getTrend', requiresRiskCheck: false, requiresConfirmation: false },
  general_chat: { targetApi: 'ai', method: 'processMessage', requiresRiskCheck: false, requiresConfirmation: false },
};

/** 可处理的意图类型集合 */
const HANDLEABLE_INTENTS = new Set<H_Intent['type']>([
  'market_query', 'open_position', 'close_position',
  'grid_create', 'grid_stop', 'swap', 'earn',
  'transfer', 'balance_query', 'risk_check',
]);

export class OkxH_IntentRouter implements IH_IntentRouter {
  async route(intent: H_Intent): Promise<H_ExecutionPlan> {
    const route = ROUTE_MAP[intent.type];
    if (!route) {
      return {
        targetApi: 'ai',
        method: 'processMessage',
        params: intent.params,
        requiresRiskCheck: false,
        requiresConfirmation: false,
      };
    }

    return {
      targetApi: route.targetApi,
      method: route.method,
      params: this._buildMethodParams(intent),
      requiresRiskCheck: route.requiresRiskCheck,
      requiresConfirmation: route.requiresConfirmation,
    };
  }

  canHandle(intent: H_Intent): boolean {
    return HANDLEABLE_INTENTS.has(intent.type);
  }

  /** 根据意图构建目标方法的参数 */
  private _buildMethodParams(intent: H_Intent): Record<string, unknown> {
    const p = intent.params;

    switch (intent.type) {
      case 'market_query':
        return { instId: p.instId || 'BTC-USDT-SWAP' };

      case 'open_position':
        return {
          instId: p.instId || 'BTC-USDT-SWAP',
          direction: p.direction || 'long',
          amount: p.amount || 100,
          leverage: p.leverage || 20,
        };

      case 'close_position':
        return { instId: p.instId || 'BTC-USDT-SWAP' };

      case 'grid_create':
        return {
          instId: p.instId || 'BTC-USDT-SWAP',
          investment: p.amount || 500,
          gridNum: p.gridNum || 50,
          direction: 'neutral',
        };

      case 'grid_stop':
        return { instId: p.instId || 'BTC-USDT-SWAP' };

      case 'swap':
        return {
          chain: 'EVM',
          fromTokenAddress: p.fromToken || '',
          toTokenAddress: p.toToken || '',
          amount: p.amount || 0,
          slippage: 0.5,
        };

      case 'earn':
        return { productId: p.productId || '', amount: p.amount || 0 };

      case 'transfer':
        return {
          chain: p.chain || 'EVM',
          tokenAddress: p.tokenAddress || '',
          toAddress: p.toAddress || '',
          amount: p.amount || 0,
        };

      case 'balance_query':
        return {};

      case 'risk_check':
        return {};

      default:
        return p;
    }
  }
}
