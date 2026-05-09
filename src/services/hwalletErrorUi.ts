import { isHwalletHttpError } from "./hwalletHttpError";

/** 给 Toast / Alert / 聊天错误气泡用的短文案 */
export function formatHwalletErrorForUser(e: unknown): string {
  if (isHwalletHttpError(e)) {
    if (e.status === -1) return "未配置后端地址，请在环境中设置 EXPO_PUBLIC_HWALLET_API_BASE。";
    if (e.status === 0) {
      if (/取消|Abort/i.test(e.message)) return "请求已取消。";
      if (/超时|timeout/i.test(e.message)) return "连接超时，请检查网络后重试。";
      return "网络异常，请稍后重试。";
    }
    if (e.status === 429) return "请求过于频繁，请稍后再试。";
    if (e.status >= 500) return "服务暂时不可用，请稍后重试。";
    if (e.detail && e.detail.length < 200) return e.detail;
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
