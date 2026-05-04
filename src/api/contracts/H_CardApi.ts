/**
 * H_CardApi — 卡片系统接口契约
 * 职责：卡片 CRUD / 分类 / 标签 / 持久化
 */

import type { HWalletCard } from '../../types/card';

/** 卡片筛选条件 */
export interface H_CardFilter {
  productLine?: 'V5' | 'V6';
  category?: string;
  tags?: string[];
  /** 时间范围 */
  startTime?: number;
  endTime?: number;
  /** 分页 */
  page?: number;
  pageSize?: number;
}

/** 卡片列表响应 */
export interface H_CardListResponse {
  cards: HWalletCard[];
  total: number;
  page: number;
  pageSize: number;
}

/** H_CardApi 接口定义 */
export interface IH_CardApi {
  /** 保存卡片 */
  saveCard(card: HWalletCard): Promise<HWalletCard>;
  /** 批量保存卡片 */
  saveCards(cards: HWalletCard[]): Promise<HWalletCard[]>;
  /** 获取卡片列表（支持筛选） */
  getCards(filter?: H_CardFilter): Promise<H_CardListResponse>;
  /** 获取单张卡片 */
  getCard(cardId: string): Promise<HWalletCard | null>;
  /** 更新卡片 */
  updateCard(cardId: string, updates: Partial<HWalletCard>): Promise<HWalletCard>;
  /** 删除卡片 */
  deleteCard(cardId: string): Promise<boolean>;
  /** 给卡片添加标签 */
  addTags(cardId: string, tags: string[]): Promise<HWalletCard>;
  /** 获取所有标签 */
  getAllTags(): Promise<string[]>;
}
