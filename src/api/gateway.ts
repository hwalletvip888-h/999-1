/**
 * H_ API Gateway — 统一调度层
 *
 * 前端通过 `api.*` 访问能力；网关将请求路由到 OKX Provider（及部分直连实现）。
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
import { getOkxGatewayCredentials, isOkxGatewayConfigured } from '../config/okxGatewayCreds';

let okxCreds: OkxCredentials = getOkxGatewayCredentials();
if (!isOkxGatewayConfigured(okxCreds)) {
  console.warn('[H_Gateway] OKX 凭证未配置（无 okx.local 且 okx.ts 未启用），OKX 私有接口将不可用');
}

export interface H_ApiGateway {
  market: IH_MarketApi;
  perpetual: IH_PerpetualApi;
  grid: IH_GridApi;
  signal: IH_SignalApi;
  account: IH_AccountApi;
  algo: IH_AlgoApi;
  bot: IH_BotApi;
  wallet: IH_WalletApi;
  swap: IH_SwapApi;
  earn: IH_EarnApi;
  security: IH_SecurityApi;
  ai: IH_AIEngine;
  router: IH_IntentRouter;
  chat: IH_ChatOrchestrator;
  auth: IH_AuthApi;
  card: IH_CardApi;
  analytics: IH_AnalyticsApi;
  risk: IH_RiskApi;
  community: IH_CommunityApi;
  notify: IH_NotifyApi;
}

/** 预留智谱接入；未完成前一律等价于 OKX */
export type ProviderMode = 'okx' | 'zhipu';

function createOkxGateway(): H_ApiGateway {
  return {
    market: new OkxH_MarketApi(),
    perpetual: new OkxH_PerpetualApi(okxCreds),
    grid: new OkxH_GridApi(okxCreds),
    signal: new OkxH_SignalApi(),
    account: new OkxH_AccountApi(okxCreds),
    algo: new OkxH_AlgoApi(okxCreds),
    bot: new OkxH_BotApi(okxCreds),
    wallet: new OkxH_WalletApi(okxCreds),
    swap: new OkxH_SwapApi(okxCreds),
    earn: new OkxH_EarnApi(okxCreds),
    security: new OkxH_SecurityApi(okxCreds),
    ai: new OkxH_AIEngine(),
    router: new OkxH_IntentRouter(),
    chat: new OkxH_ChatOrchestrator(),
    auth: new OkxH_AuthApi(okxCreds),
    card: new OkxH_CardApi(),
    analytics: new OkxH_AnalyticsApi(okxCreds),
    risk: new OkxH_RiskApi(okxCreds),
    community: new OkxH_CommunityApi(),
    notify: new OkxH_NotifyApi(),
  };
}

let currentMode: ProviderMode = 'okx';
let currentGateway: H_ApiGateway = createGateway(currentMode);

function createGateway(mode: ProviderMode): H_ApiGateway {
  switch (mode) {
    case 'okx':
      return createOkxGateway();
    case 'zhipu':
      console.warn('[H_Gateway] Zhipu 未实现，使用 OKX Gateway');
      return createOkxGateway();
    default:
      return createOkxGateway();
  }
}

export const api: H_ApiGateway = new Proxy({} as H_ApiGateway, {
  get(_target, prop: string) {
    return (currentGateway as unknown as Record<string, unknown>)[prop];
  },
});

export function getProviderMode(): ProviderMode {
  return currentMode;
}

export function switchProvider(mode: ProviderMode): void {
  currentMode = mode;
  currentGateway = createGateway(mode);
  console.log(`[H_Gateway] Provider 已切换到: ${mode}`);
}

export function updateOkxCredentials(creds: OkxCredentials): void {
  okxCreds = creds;
  if (currentMode === 'okx' || currentMode === 'zhipu') {
    currentGateway = createOkxGateway();
    console.log('[H_Gateway] OKX 凭证已更新，Gateway 已重建');
  }
}
