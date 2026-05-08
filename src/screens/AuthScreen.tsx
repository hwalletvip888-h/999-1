/**
 * 兼容层：历史代码使用 <AuthScreen onAuthSuccess />。
 * 实现已迁移至模块 `src/modules/mailRegistrationLogin`。
 */
import { MailRegistrationLoginModule } from "../modules/mailRegistrationLogin";
import type { Session } from "../services/walletApi";

export type AuthScreenProps = {
  onAuthSuccess: (session: Session) => void | Promise<void>;
};

export function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  return <MailRegistrationLoginModule onRegistrationLoginSuccess={onAuthSuccess} />;
}
