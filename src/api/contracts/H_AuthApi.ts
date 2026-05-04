/**
 * H_AuthApi — 认证接口契约
 * 职责：邮箱 OTP / Agent Wallet 注册 / 会话管理
 */

/** 用户会话 */
export interface H_Session {
  userId: string;
  email: string;
  /** 会话 Token */
  token: string;
  /** 过期时间 */
  expiresAt: number;
  /** 是否已创建 Agent Wallet */
  hasWallet: boolean;
}

/** 用户资料 */
export interface H_UserProfile {
  userId: string;
  email: string;
  nickname?: string;
  avatar?: string;
  /** 注册时间 */
  createdAt: number;
  /** 最后登录时间 */
  lastLoginAt: number;
}

/** H_AuthApi 接口定义 */
export interface IH_AuthApi {
  /** 发送验证码到邮箱 */
  sendCode(email: string): Promise<{ success: boolean; message: string }>;
  /** 验证邮箱验证码并登录/注册 */
  verifyCode(email: string, code: string): Promise<H_Session>;
  /** 获取当前会话 */
  getSession(): Promise<H_Session | null>;
  /** 获取用户资料 */
  getProfile(): Promise<H_UserProfile>;
  /** 更新用户资料 */
  updateProfile(data: Partial<Pick<H_UserProfile, 'nickname' | 'avatar'>>): Promise<H_UserProfile>;
  /** 登出 */
  logout(): Promise<void>;
  /** 检查登录状态是否有效 */
  isAuthenticated(): Promise<boolean>;
}
