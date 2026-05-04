/**
 * H_NotifyApi 实现
 * Toast / Push / 策略报告推送
 * 当前使用本地存储，未来对接 Expo Notifications
 */

import type {
  IH_NotifyApi,
  H_Notification,
  H_NotifyPriority,
} from '../../contracts/H_NotifyApi';
import { makeId } from '../../../utils/id';
const generateId = () => makeId('h');

/** 内存通知存储 */
let notificationStore: H_Notification[] = [];
let pushToken: string | null = null;

/** Toast 回调（由前端注册） */
let toastCallback: ((title: string, body: string, priority: H_NotifyPriority) => void) | null = null;

export class OkxH_NotifyApi implements IH_NotifyApi {
  /** 注册 Toast 显示回调（前端调用） */
  static registerToastHandler(
    handler: (title: string, body: string, priority: H_NotifyPriority) => void
  ): void {
    toastCallback = handler;
  }

  showToast(title: string, body: string, priority: H_NotifyPriority = 'normal'): void {
    // 同时存入通知列表
    const notification: H_Notification = {
      notifyId: generateId(),
      type: 'toast',
      priority,
      title,
      body,
      read: false,
      timestamp: Date.now(),
    };
    notificationStore.push(notification);

    // 触发前端 Toast
    if (toastCallback) {
      toastCallback(title, body, priority);
    }
  }

  async getNotifications(page = 1, pageSize = 20): Promise<{ notifications: H_Notification[]; unreadCount: number }> {
    const sorted = [...notificationStore].sort((a, b) => b.timestamp - a.timestamp);
    const start = (page - 1) * pageSize;
    const unreadCount = notificationStore.filter((n) => !n.read).length;
    return {
      notifications: sorted.slice(start, start + pageSize),
      unreadCount,
    };
  }

  async markAsRead(notifyId: string): Promise<void> {
    const notification = notificationStore.find((n) => n.notifyId === notifyId);
    if (notification) {
      notification.read = true;
    }
  }

  async markAllAsRead(): Promise<void> {
    notificationStore.forEach((n) => { n.read = true; });
  }

  async registerPushToken(token: string): Promise<boolean> {
    pushToken = token;
    // 未来对接 Expo Push Notification 服务
    return true;
  }

  /** 发送策略报告通知（内部调用） */
  sendStrategyReport(title: string, body: string, data?: Record<string, unknown>): void {
    const notification: H_Notification = {
      notifyId: generateId(),
      type: 'in_app',
      priority: 'high',
      title,
      body,
      data,
      read: false,
      timestamp: Date.now(),
    };
    notificationStore.push(notification);
  }
}
