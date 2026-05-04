/**
 * H_CardApi Mock 实现
 */

import type {
  IH_CardApi,
  H_CardFilter,
  H_CardListResponse,
} from '../../contracts/H_CardApi';
import type { HWalletCard } from '../../../types/card';

let mockCards: HWalletCard[] = [];

export class MockH_CardApi implements IH_CardApi {
  async saveCard(card: HWalletCard): Promise<HWalletCard> {
    mockCards.unshift(card);
    return card;
  }

  async saveCards(cards: HWalletCard[]): Promise<HWalletCard[]> {
    mockCards = [...cards, ...mockCards];
    return cards;
  }

  async getCards(filter?: H_CardFilter): Promise<H_CardListResponse> {
    let filtered = [...mockCards];
    if (filter?.productLine) {
      const pl = filter.productLine.toLowerCase();
      filtered = filtered.filter((c) => c.productLine === pl);
    }
    if (filter?.startTime) {
      const startTime = filter.startTime;
      filtered = filtered.filter((c) => new Date(c.createdAt).getTime() >= startTime);
    }
    if (filter?.endTime) {
      const endTime = filter.endTime;
      filtered = filtered.filter((c) => new Date(c.createdAt).getTime() <= endTime);
    }
    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 20;
    const start = (page - 1) * pageSize;
    return {
      cards: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async getCard(cardId: string): Promise<HWalletCard | null> {
    return mockCards.find((c) => c.id === cardId) || null;
  }

  async updateCard(cardId: string, updates: Partial<HWalletCard>): Promise<HWalletCard> {
    const index = mockCards.findIndex((c) => c.id === cardId);
    if (index < 0) throw new Error(`Card ${cardId} not found`);
    mockCards[index] = { ...mockCards[index], ...updates };
    return mockCards[index];
  }

  async deleteCard(cardId: string): Promise<boolean> {
    const len = mockCards.length;
    mockCards = mockCards.filter((c) => c.id !== cardId);
    return mockCards.length < len;
  }

  async addTags(cardId: string, tags: string[]): Promise<HWalletCard> {
    const card = mockCards.find((c) => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);
    // tags 存储在 agentTags 字段中（复用现有可选字段）
    card.agentTags = [...new Set([...(card.agentTags || []), ...tags])];
    return card;
  }

  async getAllTags(): Promise<string[]> {
    const allTags = mockCards.flatMap((c) => c.agentTags || []);
    return [...new Set(allTags)];
  }
}
