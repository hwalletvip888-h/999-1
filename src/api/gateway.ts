/**
 * H_ API Gateway — 统一调度层
 *
 * 所有前端组件通过 `api.*` 访问后端能力，
 * Gateway 负责将请求路由到当前激活的 Provider（Mock / OKX / Zhipu）。
 *
 * 切换 Provider 只需修改 CURRENT_MODE 或调用 switchProvider()，前端零改动。
 */

import type { IH_MarketApi } from './contracts/H_MarketApi';
import type { IH_PerpetualApi } from './contracts/H_PerpetualApi';
import type { IH_GridApi } from './contracts/H_GridApi';
import type { IH_SignalApi } from './contracts/H_SignalApi';
import type { IH_AccountApi } from './contracts/H_AccountApi';
import type { IH_WalletApi } from './contracts/H_WalletApi';
import type { IH_SwapApi } from './contracts/H_SwapApi';
import type { IH_EarnApi } from './contracts/H_EarnApi';
import type { IH_SecurityApi } from './contracts/H_SecurityApi';
import type { IH_AIEngine } from './contracts/H_AIEngine';
import type { IH_IntentRouter } from './contracts/H_IntentRouter';
import type { IH_ChatOrchestrator } from './contracts/H_ChatOrchestrator';
import type { IH_AuthApi } from './contracts/H_AuthApi';
import type { IH_CardApi } from './contracts/H_CardApi';
import type { IH_AnalyticsApi } from './contracts/H_AnalyticsApi';
import type { IH_RiskApi } from './contracts/H_RiskApi';
import type { IH_CommunityApi } from './contracts/H_CommunityApi';
import type { IH_NotifyApi } from './contracts/H_NotifyApi';
import type { IH_AlgoApi } from './contracts/H_AlgoApi';
import type { IH_BotApi } from './contracts/H_BotApi';

// ─── Mock Provider 引入 ────────────────────────────────────────
import { MockH_MarketApi } from './providers/mock/H_MarketApi.mock';
import { MockH_PerpetualApi } from './providers/mock/H_PerpetualApi.mock';
import { MockH_GridApi } from './providers/mock/H_GridApi.mock';
import { MockH_SignalApi } from './providers/mock/H_SignalApi.mock';
import { MockH_AccountApi } from './providers/mock/H_AccountApi.mock';
import { MockH_WalletApi } from './providers/mock/H_WalletApi.mock';
import { MockH_AuthApi } from './providers/mock/H_AuthApi.mock';
import { MockH_CardApi } from './providers/mock/H_CardApi.mock';
import { MockH_AnalyticsApi } from './providers/mock/H_AnalyticsApi.mock';
import { MockH_RiskApi } from './providers/mock/H_RiskApi.mock';

// ─── OKX Provider 引入 ────────────────────────────────────────
import { OkxH_MarketApi } from './providers/okx/H_MarketApi.okx';
import { OkxH_AccountApi } from './providers/okx/H_AccountApi.okx';
import { OkxH_PerpetualApi } from './providers/okx/H_PerpetualApi.okx';
import { OkxH_GridApi } from './providers/okx/H_GridApi.okx';
import { OkxH_SignalApi } from './providers/okx/H_SignalApi.okx';
import { OkxH_WalletApi } from './providers/okx/H_WalletApi.okx';
import { OkxH_SwapApi } from './providers/okx/H_SwapApi.okx';
import { OkxH_EarnApi } from './providers/okx/H_EarnApi.okx';
import { OkxH_SecurityApi } from './providers/okx/H_SecurityApi.okx';
import { OkxH_AIEngine } from './providers/okx/H_AIEngine.okx';
import { OkxH_IntentRouter } from './providers/okx/H_IntentRouter.okx';
import { OkxH_ChatOrchestrator } from './providers/okx/H_ChatOrchestrator.okx';
import { OkxH_AuthApi } from './providers/okx/H_AuthApi.okx';
import { OkxH_CardApi } from './providers/okx/H_CardApi.okx';
import { OkxH_AnalyticsApi } from './providers/okx/H_AnalyticsApi.okx';
import { OkxH_RiskApi } from './providers/okx/H_RiskApi.okx';
import { OkxH_CommunityApi } from './providers/okx/H_CommunityApi.okx';
import { OkxH_NotifyApi } from './providers/okx/H_NotifyApi.okx';
import { OkxH_AlgoApi } from './providers/okx/H_AlgoApi.okx';
import { OkxH_BotApi } from './providers/okx/H_BotApi.okx';
import type { OkxCredentials } from './providers/okx/okxClient';

// ─── OKX 凭证配置 ─────────────────────────────────────────────
let okxCreds: OkxCredentials = {
  apiKey: '',
  secretKey: '',
  passphrase: '',
};

try {
  const localConfig = require('../../config/okx.local');
  if (localConfig?.OKX_CONFIG) {
    okxCreds = {
      apiKey: localConfig.OKX_CONFIG.apiKey || '',
      secretKey: localConfig.OKX_CONFIG.secretKey || '',
      passphrase: localConfig.OKX_CONFIG.passphrase || '',
    };
  }
} catch {
  console.warn('[H_Gateway] okx.local.ts 未找到，OKX 私有接口将不可用');
}

// ─── Gateway 接口定义 ──────────────────────────────────────────

export interface H_ApiGateway {
  /** V5 智能交易 */
  market: IH_MarketApi;
  perpetual: IH_PerpetualApi;
  grid: IH_GridApi;
  signal: IH_SignalApi;
  account: IH_AccountApi;
  algo: IH_AlgoApi;
  bot: IH_BotApi;

  /** V6 智能钱包 */
  wallet: IH_WalletApi;
  swap: IH_SwapApi;
  earn: IH_EarnApi;
  security: IH_SecurityApi;

  /** AI 层 */
  ai: IH_AIEngine;
  router: IH_IntentRouter;
  chat: IH_ChatOrchestrator;

  /** 平台公共层 */
  auth: IH_AuthApi;
  card: IH_CardApi;
  analytics: IH_AnalyticsApi;
  risk: IH_RiskApi;
  community: IH_CommunityApi;
  notify: IH_NotifyApi;
}

// ─── Provider 模式 ─────────────────────────────────────────────

export type ProviderMode = 'mock' | 'okx' | 'zhipu';

// ─── 创建 Gateway 实例 ─────────────────────────────────────────

function createMockGateway(): H_ApiGateway {
  return {
    // V5
    market: new MockH_MarketApi(),
    perpetual: new MockH_PerpetualApi(),
    grid: new MockH_GridApi(),
    signal: new MockH_SignalApi(),
    account: new MockH_AccountApi(),
    algo: new OkxH_AlgoApi(okxCreds),      // Algo 无 Mock，直接用 OKX
    bot: new OkxH_BotApi(okxCreds),        // Bot 无 Mock，直接用 OKX
    // V6
    wallet: new MockH_WalletApi(),
    swap: new OkxH_SwapApi(okxCreds),       // DEX 无 Mock，直接用 OKX
    earn: new OkxH_EarnApi(okxCreds),       // Earn 无 Mock，直接用 OKX
    security: new OkxH_SecurityApi(okxCreds), // Security 无 Mock，直接用 OKX
    // AI
    ai: new OkxH_AIEngine(),
    router: new OkxH_IntentRouter(),
    chat: new OkxH_ChatOrchestrator(),
    // 平台
    auth: new MockH_AuthApi(),
    card: new MockH_CardApi(),
    analytics: new MockH_AnalyticsApi(),
    risk: new MockH_RiskApi(),
    community: new OkxH_CommunityApi(),
    notify: new OkxH_NotifyApi(),
  };
}

function createOkxGateway(): H_ApiGateway {
  return {
    // V5 智能交易 — 全部 OKX 实盘
    market: new OkxH_MarketApi(),
    perpetual: new OkxH_PerpetualApi(okxCreds),
    grid: new OkxH_GridApi(okxCreds),
    signal: new OkxH_SignalApi(),
    account: new OkxH_AccountApi(okxCreds),
    algo: new OkxH_AlgoApi(okxCreds),
    bot: new OkxH_BotApi(okxCreds),
    // V6 智能钱包 — 全部 OKX 实盘
    wallet: new OkxH_WalletApi(okxCreds),
    swap: new OkxH_SwapApi(okxCreds),
    earn: new OkxH_EarnApi(okxCreds),
    security: new OkxH_SecurityApi(okxCreds),
    // AI 层
    ai: new OkxH_AIEngine(),
    router: new OkxH_IntentRouter(),
    chat: new OkxH_ChatOrchestrator(),
    // 平台公共层
    auth: new OkxH_AuthApi(okxCreds),
    card: new OkxH_CardApi(),
    analytics: new OkxH_AnalyticsApi(okxCreds),
    risk: new OkxH_RiskApi(okxCreds),
    community: new OkxH_CommunityApi(),
    notify: new OkxH_NotifyApi(),
  };
}

// ─── 当前模式 ──────────────────────────────────────────────────

let currentMode: ProviderMode = 'okx';
let currentGateway: H_ApiGateway = createGateway(currentMode);

function createGateway(mode: ProviderMode): H_ApiGateway {
  switch (mode) {
    case 'okx':
      return createOkxGateway();
    case 'mock':
      return createMockGateway();
    case 'zhipu':
      console.warn('[H_Gateway] Zhipu provider not implemented, falling back to mock');
      return createMockGateway();
    default:
      return createMockGateway();
  }
}

// ─── 导出 ──────────────────────────────────────────────────────

/** 全局 API 入口 */
export const api: H_ApiGateway = new Proxy({} as H_ApiGateway, {
  get(_target, prop: string) {
    return (currentGateway as any)[prop];
  },
});

/** 获取当前 Provider 模式 */
export function getProviderMode(): ProviderMode {
  return currentMode;
}

/** 动态切换 Provider */
export function switchProvider(mode: ProviderMode): void {
  currentMode = mode;
  currentGateway = createGateway(mode);
  console.log(`[H_Gateway] Provider 已切换到: ${mode}`);
}

/** 更新 OKX 凭证 */
export function updateOkxCredentials(creds: OkxCredentials): void {
  okxCreds = creds;
  if (currentMode === 'okx') {
    currentGateway = createOkxGateway();
    console.log('[H_Gateway] OKX 凭证已更新，Gateway 已重建');
  }
}
