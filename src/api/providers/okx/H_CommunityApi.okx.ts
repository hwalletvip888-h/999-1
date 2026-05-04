/**
 * H_CommunityApi 实现
 * 社区消息流 / 卡片分享 / 热点聚合
 * 当前使用本地存储，未来对接 Supabase 实时数据库
 */

import type {
  IH_CommunityApi,
  H_CommunityMessage,
  H_HotTopic,
} from '../../contracts/H_CommunityApi';
import type { HWalletCard } from '../../../types/card';
import { makeId } from '../../../utils/id';
const generateId = () => makeId('h');

/** 内存消息存储 */
let messageStore: H_CommunityMessage[] = [];
let hotTopics: H_HotTopic[] = [
  {
    topicId: 'hot_1',
    title: 'BTC 突破新高，市场情绪高涨',
    source: 'twitter',
    heat: 9500,
    relatedCoins: ['BTC'],
    timestamp: Date.now() - 3600000,
  },
  {
    topicId: 'hot_2',
    title: 'ETH ETF 资金持续流入',
    source: 'news',
    heat: 8200,
    relatedCoins: ['ETH'],
    timestamp: Date.now() - 7200000,
  },
  {
    topicId: 'hot_3',
    title: 'SOL 生态 Meme 币爆发',
    source: 'community',
    heat: 7800,
    relatedCoins: ['SOL', 'BONK', 'WIF'],
    timestamp: Date.now() - 10800000,
  },
];

export class OkxH_CommunityApi implements IH_CommunityApi {
  private userId: string;
  private nickname: string;

  constructor(userId?: string, nickname?: string) {
    this.userId = userId || 'user_default';
    this.nickname = nickname || 'H Wallet 用户';
  }

  async getMessages(page = 1, pageSize = 20): Promise<{ messages: H_CommunityMessage[]; total: number }> {
    const sorted = [...messageStore].sort((a, b) => b.timestamp - a.timestamp);
    const start = (page - 1) * pageSize;
    return {
      messages: sorted.slice(start, start + pageSize),
      total: messageStore.length,
    };
  }

  async sendMessage(text: string): Promise<H_CommunityMessage> {
    const msg: H_CommunityMessage = {
      messageId: generateId(),
      userId: this.userId,
      nickname: this.nickname,
      type: 'text',
      text,
      likes: 0,
      isLiked: false,
      timestamp: Date.now(),
    };
    messageStore.push(msg);
    return msg;
  }

  async shareCard(cardId: string, comment?: string): Promise<H_CommunityMessage> {
    const msg: H_CommunityMessage = {
      messageId: generateId(),
      userId: this.userId,
      nickname: this.nickname,
      type: 'card_share',
      text: comment || '分享了一张交易卡片',
      // sharedCard 需要从 CardApi 获取，这里只记录 ID
      sharedCard: { id: cardId } as HWalletCard,
      likes: 0,
      isLiked: false,
      timestamp: Date.now(),
    };
    messageStore.push(msg);
    return msg;
  }

  async toggleLike(messageId: string): Promise<{ liked: boolean; likes: number }> {
    const msg = messageStore.find((m) => m.messageId === messageId);
    if (!msg) {
      throw new Error(`[H_CommunityApi] 消息不存在: ${messageId}`);
    }
    msg.isLiked = !msg.isLiked;
    msg.likes += msg.isLiked ? 1 : -1;
    return { liked: msg.isLiked, likes: msg.likes };
  }

  async getHotTopics(limit = 10): Promise<H_HotTopic[]> {
    return hotTopics
      .sort((a, b) => b.heat - a.heat)
      .slice(0, limit);
  }
}
