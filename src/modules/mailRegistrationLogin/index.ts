/**
 * 邮件注册登录模块 — 唯一职责：安装 App → 邮箱 OTP → 会话就绪（onRegistrationLoginSuccess）
 *
 * 其它能力（行情、钱包资产、对话等）均属后续模块；不在此混入。
 */

export type { MailRegistrationLoginModuleProps } from "./MailRegistrationLoginModule";
export { MailRegistrationLoginModule } from "./MailRegistrationLoginModule";

export type { Session, WalletAddresses } from "../../services/walletApi";
export { sendOtp, verifyOtp, loadSession, clearSession, refreshAddresses } from "../../services/walletApi";
