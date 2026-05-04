/**
 * H_AuthApi OKX 实盘实现
 * 对接 OKX Agent Wallet 注册 + 邮箱 OTP 认证
 */

import type {
  IH_AuthApi,
  H_Session,
  H_UserProfile,
} from '../../contracts/H_AuthApi';
import type { OkxCredentials } from './okxClient';
import * as okxClient from './okxClient';

/** 本地会话存储（运行时） */
let currentSession: H_Session | null = null;
let currentProfile: H_UserProfile | null = null;

export class OkxH_AuthApi implements IH_AuthApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  async sendCode(email: string): Promise<{ success: boolean; message: string }> {
    // 通过 OKX Agent Wallet API 发送验证码
    const res = await okxClient.request(
      'POST',
      '/api/v5/waas/auth/send-code',
      this.creds,
      { email }
    );
    if (res.code !== '0') {
      return { success: false, message: res.msg || '发送验证码失败' };
    }
    return { success: true, message: '验证码已发送' };
  }

  async verifyCode(email: string, code: string): Promise<H_Session> {
    // 验证邮箱验证码 → 注册/登录 → 创建 Agent Wallet
    const res = await okxClient.request(
      'POST',
      '/api/v5/waas/auth/verify-code',
      this.creds,
      { email, code }
    );
    if (res.code !== '0') {
      throw new Error(`[H_AuthApi] verifyCode 失败: ${res.msg}`);
    }
    const data = res.data?.[0] || {};
    const session: H_Session = {
      userId: data.userId || `user_${Date.now()}`,
      email,
      token: data.token || data.sessionToken || '',
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 天
      hasWallet: data.hasWallet === true || data.walletAddress !== undefined,
    };
    currentSession = session;
    currentProfile = {
      userId: session.userId,
      email,
      createdAt: parseInt(data.createdAt || String(Date.now())),
      lastLoginAt: Date.now(),
    };
    return session;
  }

  async getSession(): Promise<H_Session | null> {
    if (!currentSession) return null;
    // 检查是否过期
    if (currentSession.expiresAt < Date.now()) {
      currentSession = null;
      return null;
    }
    return currentSession;
  }

  async getProfile(): Promise<H_UserProfile> {
    if (!currentProfile) {
      throw new Error('[H_AuthApi] 未登录');
    }
    return currentProfile;
  }

  async updateProfile(data: Partial<Pick<H_UserProfile, 'nickname' | 'avatar'>>): Promise<H_UserProfile> {
    if (!currentProfile) {
      throw new Error('[H_AuthApi] 未登录');
    }
    if (data.nickname) currentProfile.nickname = data.nickname;
    if (data.avatar) currentProfile.avatar = data.avatar;
    return currentProfile;
  }

  async logout(): Promise<void> {
    currentSession = null;
    currentProfile = null;
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null;
  }
}
