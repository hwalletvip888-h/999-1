import { isHwalletHttpError } from "./hwalletHttpError";

/**
 * 将任意错误转成对用户友好的中文提示
 * 原则：不暴露技术细节，给出能操作的建议
 */
export function formatHwalletErrorForUser(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");

  // ── 网络 / 连接类 ──────────────────────────────────────────
  if (/abort|取消/i.test(raw)) return "操作已取消。";
  if (/timeout|超时/i.test(raw)) return "连接超时，请检查网络后重试。";
  if (/network|network error|fetch|ECONNREFUSED|ENOTFOUND/i.test(raw)) {
    return "网络连接失败，请检查网络后重试。";
  }

  // ── 登录 / 鉴权 ────────────────────────────────────────────
  if (/token|未登录|login|auth|401|403/i.test(raw)) {
    return "登录已过期，请重新登录后操作。";
  }

  // ── 后端未配置 ─────────────────────────────────────────────
  if (/EXPO_PUBLIC_HWALLET_API_BASE|未配置.*后端|后端.*未配置/i.test(raw)) {
    return "服务地址未配置，请联系管理员。";
  }

  // ── 余额不足 ───────────────────────────────────────────────
  if (/余额不足|insufficient|balance|fund/i.test(raw)) {
    return "余额不足，请先充值后再操作。";
  }

  // ── 兑换 / swap 相关 ───────────────────────────────────────
  if (/不支持的源代币|不支持的目标代币|unsupported.*token/i.test(raw)) {
    return "暂不支持该代币兑换，请换一个代币试试。";
  }
  if (/未返回交易哈希|no.*txHash/i.test(raw)) {
    return "交易提交失败，链上未返回结果，请稍后重试。";
  }
  if (/兑换报价失败|quote.*fail|swap.*fail/i.test(raw)) {
    return "获取兑换报价失败，可能是该交易对流动性不足，请稍后重试。";
  }
  if (/兑换提交失败|swap.*execute/i.test(raw)) {
    return "兑换交易提交失败，请检查余额和 Gas 费后重试。";
  }

  // ── 转账相关 ───────────────────────────────────────────────
  if (/参数不完整|参数.*缺少|missing.*param/i.test(raw)) {
    return "转账参数不完整，请确认地址和金额后重试。";
  }
  if (/无法解析.*合约|合约地址/i.test(raw)) {
    return "该代币合约暂未收录，请在 App 内选择代币后再转账。";
  }
  if (/无法获取.*地址|wallet.*address/i.test(raw)) {
    return "无法获取钱包地址，请重新登录后重试。";
  }

  // ── 服务器 / CLI 未就绪 ────────────────────────────────────
  if (/onchainos.*未就绪|CLI.*未就绪|cli.*not.*ready/i.test(raw)) {
    return "链上通道暂未就绪，服务器正在初始化，请稍候片刻再试。";
  }
  if (/500|服务暂时不可用|server.*error|internal.*error/i.test(raw)) {
    return "服务暂时不可用，请稍后重试。";
  }
  if (/429|频繁|rate.*limit|too frequent|too many/i.test(raw)) {
    return "验证码发送太频繁，请等 10 分钟后再试。";
  }

  // ── HTTP 错误对象 ──────────────────────────────────────────
  if (isHwalletHttpError(e)) {
    if (e.status === -1) return "服务地址未配置，请联系管理员。";
    if (e.status === 0) return "网络连接失败，请检查网络后重试。";
    if (e.status === 401 || e.status === 403) return "登录已过期，请重新登录。";
    if (e.status === 429) return "请求太频繁，请稍等几秒后再试。";
    if (e.status >= 500) return "服务暂时不可用，请稍后重试。";
    if (e.detail && e.detail.length < 120) return e.detail;
  }

  // ── 通用兜底 ───────────────────────────────────────────────
  if (raw && raw.length < 80 && /[\u4e00-\u9fa5]/.test(raw)) {
    return raw; // 本来就是中文短句，直接用
  }
  return "出了点问题，请稍后重试。如持续出现请重启 App。";
}
