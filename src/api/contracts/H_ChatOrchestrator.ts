/**
 * H_ChatOrchestrator — 对话编排接口契约
 * 职责：管理多轮对话状态、确认流程、卡片动作分发
 */

import type { H_AIResponse, H_UserMessage, H_SessionContext } from './H_AIEngine';
export type { H_UserMessage, H_SessionContext } from './H_AIEngine';
import type { HWalletCard } from '../../types/card';

/** 用户在卡片上的动作 */
export type H_CardAction =
  | { type: 'confirm'; cardId: string }
  | { type: 'cancel'; cardId: string }
  | { type: 'modify'; cardId: string; changes: Record<string, unknown> };

/** Bot 回复（包含文本和/或卡片） */
export interface H_BotResponse {
  text: string;
  cards: HWalletCard[];
  /** 当前对话是否结束（如交易完成） */
  sessionComplete: boolean;
}

/** H_ChatOrchestrator 接口定义 */
export interface IH_ChatOrchestrator {
  /** 处理用户文本消息 */
  handleMessage(message: H_UserMessage): Promise<H_BotResponse>;
  /** 处理用户对卡片的动作（确认/取消/修改） */
  handleCardAction(action: H_CardAction): Promise<H_BotResponse>;
  /** 获取当前会话上下文 */
  getContext(): H_SessionContext;
  /** 重置会话 */
  resetSession(): void;
}
