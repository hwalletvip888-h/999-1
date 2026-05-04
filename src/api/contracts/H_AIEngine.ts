/**
 * H_AIEngine — AI 引擎接口契约
 * 职责：自然语言理解 + 意图识别 + 卡片生成
 */

import type { HWalletCard } from '../../types/card';

/** 用户消息 */
export interface H_UserMessage {
  id: string;
  text: string;
  timestamp: number;
  /** 附带的上下文（如当前持仓、行情快照） */
  attachments?: Record<string, unknown>;
}

/** 会话上下文 */
export interface H_SessionContext {
  sessionId: string;
  userId: string;
  /** 最近 N 条历史消息摘要 */
  history: H_UserMessage[];
  /** 当前激活的产品线 */
  activeProductLine?: 'V5' | 'V6';
}

/** AI 识别出的意图 */
export interface H_Intent {
  type: 'market_query' | 'open_position' | 'close_position' | 'grid_create' | 'grid_stop' | 'swap' | 'earn' | 'transfer' | 'balance_query' | 'risk_check' | 'trend_query' | 'general_chat';
  confidence: number;
  /** 从用户消息中提取的参数 */
  params: Record<string, unknown>;
  /** 归属产品线 */
  productLine: 'V5' | 'V6' | 'common';
}

/** AI 引擎的响应 */
export interface H_AIResponse {
  intent: H_Intent;
  /** 生成的回复文本 */
  replyText: string;
  /** 生成的卡片（可选，如交易确认卡、行情卡） */
  card?: Partial<HWalletCard>;
  /** 是否需要用户确认才能执行 */
  requiresConfirmation: boolean;
}

/** H_AIEngine 接口定义 */
export interface IH_AIEngine {
  /** 处理用户消息，返回意图 + 回复 */
  processMessage(message: H_UserMessage, context: H_SessionContext): Promise<H_AIResponse>;
  /** 根据确认结果生成执行卡片 */
  generateExecutionCard(intent: H_Intent, confirmed: boolean): Promise<HWalletCard | null>;
}
