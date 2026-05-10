/** H Wallet 移动端 HTTP 超时常量（无 RN / Expo 依赖，供单测与 walletApiHttp 共用） */
export const FETCH_TIMEOUT_MS = 28_000;
export const OTP_POST_DEADLINE_MS = 32_000;

const _ext = parseInt(process.env.HWALLET_EXTERNAL_LLM_FETCH_TIMEOUT_MS || "120000", 10);
/** 钱包后端调用外部 LLM（Claude / DeepSeek）的 fetch 超时；可用环境变量覆盖， clamp 30s–300s */
export const EXTERNAL_LLM_FETCH_TIMEOUT_MS = Math.min(
  300_000,
  Math.max(30_000, Number.isFinite(_ext) ? _ext : 120_000),
);
