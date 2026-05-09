/**
 * OKX Provider — 统一导出
 *
 * 命名锁定（H_Wallet_V5_V6_Product_Skills.md）：
 *   V5 = AI 合约策略  ← agent-trade-kit / OKX CEX
 *   V6 = 链上赚币     ← onchainos-skills / Onchain OS
 *   两者代码隔离，互不 import；共享传输层 okxHttpCore（中性）
 */

// ─── V5：AI 合约策略（OKX 交易所 / agent-trade-kit） ────────────
export { OkxH_MarketApi } from './H_MarketApi.okx';
export { OkxH_PerpetualApi } from './H_PerpetualApi.okx';
export { OkxH_GridApi } from './H_GridApi.okx';
export { OkxH_AccountApi } from './H_AccountApi.okx';
export { OkxH_SignalApi } from './H_SignalApi.okx';
export { OkxH_AlgoApi } from './H_AlgoApi.okx';
export { OkxH_BotApi } from './H_BotApi.okx';

// ─── V6：链上赚币（Onchain OS / onchainos-skills） ──────────────
export { OkxH_WalletApi } from './H_WalletApi.okx';
export { OkxH_SwapApi } from './H_SwapApi.okx';
export { OkxH_EarnApi } from './H_EarnApi.okx';
export { OkxH_SecurityApi } from './H_SecurityApi.okx';

// ─── AI 层（V5 流程编排） ───────────────────────────────────────
export { OkxH_AIEngine } from './H_AIEngine.okx';
export { OkxH_IntentRouter } from './H_IntentRouter.okx';
export { OkxH_ChatOrchestrator } from './H_ChatOrchestrator.okx';

// ─── 平台公共层（产品线中性） ───────────────────────────────────
export { OkxH_AuthApi } from './H_AuthApi.okx';
export { OkxH_CardApi } from './H_CardApi.okx';
export { OkxH_AnalyticsApi } from './H_AnalyticsApi.okx';
export { OkxH_RiskApi } from './H_RiskApi.okx';
export { OkxH_CommunityApi } from './H_CommunityApi.okx';
export { OkxH_NotifyApi } from './H_NotifyApi.okx';

// ─── 底层（中性传输 + 凭证类型） ────────────────────────────────
export type { OkxCredentials, OkxResponse } from './okxHttpCore';
export { request as okxRequest, sign as okxSign, OKX_BASE_URL } from './okxHttpCore';

// ─── V6 链上专用客户端（hvip.io 后端代理 onchainos CLI） ────────
export { okxOnchainClient } from './okxOnchainClient';
export type {
  ChainId,
  WalletPortfolio,
  WalletPortfolioToken,
  DexSwapQuote,
  DexSwapExecuteResult,
  WalletSendResult,
  DefiOpportunity,
  DefiPosition,
  DexSignal,
} from './okxOnchainClient';
