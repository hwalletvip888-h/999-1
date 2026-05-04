import type { TradeCard, WalletAsset } from "../types";
import { walletAssets } from "../data/mockData";

export async function getWalletAssets(): Promise<WalletAsset[]> {
  return walletAssets;
}

export async function previewTrade(card: TradeCard): Promise<TradeCard> {
  return card;
}

export async function executeTrade(card: TradeCard): Promise<TradeCard> {
  return {
    ...card,
    status: "executed"
  };
}

export const apiContracts = {
  aiChat: "/api/ai/chat",
  parseIntent: "/api/ai/parse-intent",
  walletBalance: "/api/wallet/balance",
  tradePreview: "/api/trade/preview",
  tradeExecute: "/api/trade/execute",
  cards: "/api/cards"
} as const;
