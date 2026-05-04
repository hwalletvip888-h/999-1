/**
 * H_CardApi OKX 实盘实现
 * 卡片本地存储（内存 Map）
 * 未来可对接 Supabase 云端同步
 */

import type {
  IH_CardApi,
  H_CardFilter,
  H_CardListResponse,
} from '../../contracts/H_CardApi';
import type { HWalletCard } from '../../../types/card';

/** 内存卡片存储（运行时） */
let cardStore: Map<string, HWalletCard> = new Map();
let tagSet: Set<string> = new Set();

export class OkxH_CardApi implements IH_CardApi {
  async saveCard(card: HWalletCard): Promise<HWalletCard> {
    const savedCard: HWalletCard = {
      ...card,
      createdAt: card.createdAt || new Date().toISOString(),
    };
    cardStore.set(savedCard.id, savedCard);
    // 收集标签（agentTags 作为标签来源）
    if (savedCard.agentTags) {
      savedCard.agentTags.forEach((t) => tagSet.add(t));
    }
    return savedCard;
  }

  async saveCards(cards: HWalletCard[]): Promise<HWalletCard[]> {
    const results: HWalletCard[] = [];
    for (const card of cards) {
      results.push(await this.saveCard(card));
    }
    return results;
  }

  async getCards(filter?: H_CardFilter): Promise<H_CardListResponse> {
    let cards = Array.from(cardStore.values());

    if (filter) {
      if (filter.productLine) {
        const pl = filter.productLine === 'V5' ? 'v5' : 'v6';
        cards = cards.filter((c) => c.productLine === pl);
      }
      if (filter.category) {
        cards = cards.filter((c) => c.cardType === filter.category);
      }
      if (filter.tags && filter.tags.length > 0) {
        cards = cards.filter((c) =>
          c.agentTags && filter.tags!.some((t) => c.agentTags!.includes(t))
        );
      }
      if (filter.startTime) {
        cards = cards.filter((c) => new Date(c.createdAt).getTime() >= filter.startTime!);
      }
      if (filter.endTime) {
        cards = cards.filter((c) => new Date(c.createdAt).getTime() <= filter.endTime!);
      }
    }

    // 按时间倒序
    cards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 分页
    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 20;
    const start = (page - 1) * pageSize;
    const paged = cards.slice(start, start + pageSize);

    return {
      cards: paged,
      total: cards.length,
      page,
      pageSize,
    };
  }

  async getCard(cardId: string): Promise<HWalletCard | null> {
    return cardStore.get(cardId) || null;
  }

  async updateCard(cardId: string, updates: Partial<HWalletCard>): Promise<HWalletCard> {
    const existing = cardStore.get(cardId);
    if (!existing) {
      throw new Error(`[H_CardApi] 卡片不存在: ${cardId}`);
    }
    const updated: HWalletCard = {
      ...existing,
      ...updates,
      id: cardId, // 不允许修改 ID
    };
    cardStore.set(cardId, updated);
    return updated;
  }

  async deleteCard(cardId: string): Promise<boolean> {
    return cardStore.delete(cardId);
  }

  async addTags(cardId: string, tags: string[]): Promise<HWalletCard> {
    const existing = cardStore.get(cardId);
    if (!existing) {
      throw new Error(`[H_CardApi] 卡片不存在: ${cardId}`);
    }
    const currentTags = existing.agentTags || [];
    const newTags = [...new Set([...currentTags, ...tags])];
    newTags.forEach((t) => tagSet.add(t));
    const updated: HWalletCard = {
      ...existing,
      agentTags: newTags,
    };
    cardStore.set(cardId, updated);
    return updated;
  }

  async getAllTags(): Promise<string[]> {
    return Array.from(tagSet);
  }
}
