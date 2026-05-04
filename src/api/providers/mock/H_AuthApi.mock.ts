/**
 * H_AuthApi Mock 实现
 */

import type { IH_AuthApi, H_Session, H_UserProfile } from '../../contracts/H_AuthApi';

const MOCK_CODE = '123456';
let currentSession: H_Session | null = null;

export class MockH_AuthApi implements IH_AuthApi {
  async sendCode(_email: string): Promise<{ success: boolean; message: string }> {
    return { success: true, message: '验证码已发送（Mock: 123456）' };
  }

  async verifyCode(email: string, code: string): Promise<H_Session> {
    if (code !== MOCK_CODE) {
      throw new Error('验证码错误');
    }
    currentSession = {
      userId: `user_${email.split('@')[0]}`,
      email,
      token: `mock_token_${Date.now()}`,
      expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
      hasWallet: true,
    };
    return currentSession;
  }

  async getSession(): Promise<H_Session | null> {
    return currentSession;
  }

  async getProfile(): Promise<H_UserProfile> {
    if (!currentSession) throw new Error('未登录');
    return {
      userId: currentSession.userId,
      email: currentSession.email,
      nickname: currentSession.email.split('@')[0],
      createdAt: Date.now() - 30 * 24 * 3600 * 1000,
      lastLoginAt: Date.now(),
    };
  }

  async updateProfile(data: Partial<Pick<H_UserProfile, 'nickname' | 'avatar'>>): Promise<H_UserProfile> {
    const profile = await this.getProfile();
    return { ...profile, ...data };
  }

  async logout(): Promise<void> {
    currentSession = null;
  }

  async isAuthenticated(): Promise<boolean> {
    return currentSession !== null && currentSession.expiresAt > Date.now();
  }
}
