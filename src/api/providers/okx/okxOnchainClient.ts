/**
 * okxOnchainClient — V6 链上客户端（实现拆至 `./onchain/`）
 *
 * 设计原则见原文件头注释；此处仅作 barrel 导出以保持 import 路径稳定。
 */
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
} from "./onchain/types";
export type { OnchainRequestOpts } from "./onchain/client";
export { okxOnchainClient } from "./onchain/client";
