/**
 * H_NotifyApi — 通知接口契约
 * 职责：Toast / Push / 策略报告推送
 */

/** 通知类型 */
export type H_NotifyType = 'toast' | 'push' | 'in_app';

/** 通知优先级 */
export type H_NotifyPriority = 'low' | 'normal' | 'high' | 'urgent';

/** 通知消息 */
export interface H_Notification {
  notifyId: string;
  type: H_NotifyType;
  priority: H_NotifyPriority;
  title: string;
  body: string;
  /** 关联的数据（如订单 ID、卡片 ID） */
  data?: Record<string, unknown>;
  /** 是否已读 */
  read: boolean;
  timestamp: number;
}

/** H_NotifyApi 接口定义 */
export interface IH_NotifyApi {
  /** 发送本地 Toast 通知 */
  showToast(title: string, body: string, priority?: H_NotifyPriority): void;
  /** 获取通知列表 */
  getNotifications(page?: number, pageSize?: number): Promise<{ notifications: H_Notification[]; unreadCount: number }>;
  /** 标记为已读 */
  markAsRead(notifyId: string): Promise<void>;
  /** 全部标记已读 */
  markAllAsRead(): Promise<void>;
  /** 注册推送 Token（用于远程推送） */
  registerPushToken(token: string): Promise<boolean>;
}
