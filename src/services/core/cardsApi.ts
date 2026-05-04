// 卡片生成与管理 mock
import type { HWalletCard, CardStatus } from "../../types/card";
import type { ApiResponse } from "../../types/api";


const cards: HWalletCard[] = [];

export function createCard(card: HWalletCard): ApiResponse<HWalletCard> {
  cards.push(card);
  return { ok: true, data: card, simulationMode: true };
}

export function createTradeCard(card: HWalletCard): ApiResponse<HWalletCard> {
  return createCard(card);
}

export function createStrategyCard(card: HWalletCard): ApiResponse<HWalletCard> {
  return createCard(card);
}

export function getCards(): ApiResponse<HWalletCard[]> {
  return { ok: true, data: [...cards] };
}

export function updateCardStatus(cardId: string, status: CardStatus): ApiResponse<HWalletCard | undefined> {
  const card = cards.find((c) => c.id === cardId);
  if (card) {
    card.status = status;
    return { ok: true, data: card };
  }
  return { ok: false };
}
