/**
 * H_CommunityApi — 社区接口契约
 * 职责：消息流 / 卡片分享 / 热点聚合
 */

import type { HWalletCard } from '../../types/card';

/** 社区消息 */
export interface H_CommunityMessage {
  messageId: string;
  userId: string;
  nickname: string;
  avatar?: string;
  /** 消息类型 */
  type: 'text' | 'card_share' | 'system';
  text?: string;
  /** 分享的卡片 */
  sharedCard?: HWalletCard;
  /** 点赞数 */
  likes: number;
  /** 是否已点赞 */
  isLiked: boolean;
  timestamp: number;
}

/** 热点话题 */
export interface H_HotTopic {
  topicId: string;
  title: string;
  source: 'community' | 'twitter' | 'news';
  /** 热度值 */
  heat: number;
  /** 相关币种 */
  relatedCoins: string[];
  timestamp: number;
}

/** H_CommunityApi 接口定义 */
export interface IH_CommunityApi {
  /** 获取社区消息流 */
  getMessages(page?: number, pageSize?: number): Promise<{ messages: H_CommunityMessage[]; total: number }>;
  /** 发送消息 */
  sendMessage(text: string): Promise<H_CommunityMessage>;
  /** 分享卡片到社区 */
  shareCard(cardId: string, comment?: string): Promise<H_CommunityMessage>;
  /** 点赞/取消点赞 */
  toggleLike(messageId: string): Promise<{ liked: boolean; likes: number }>;
  /** 获取热点话题 */
  getHotTopics(limit?: number): Promise<H_HotTopic[]>;
}
