/**
 * okx.ts — 凭证加载入口（可提交）
 *
 * 从内置硬编码凭证加载（生产构建）。
 * 如果凭证为空，返回 null，应用走 mock。
 */
import { isOkxConfigured, type OkxCredentials } from "./okxTypes";

// 生产环境凭证 — 构建时内联
const BUILT_IN_CREDENTIALS: OkxCredentials = {
  apiKey: "b6c3f62f-5f74-45ba-a2fe-f38aa32e9fcf",
  apiSecret: "804E87424CAEF1483E0968416108DFB3",
  passphrase: "Haitun888.",
  simulated: false,
  // OKX Developer Platform > Builder Code（用于 X Layer / DEX 归因统计）
  builderCode: "yf83qce657mqxsjw",
};

export function loadOkxCredentials(): OkxCredentials | null {
  if (isOkxConfigured(BUILT_IN_CREDENTIALS)) {
    return BUILT_IN_CREDENTIALS;
  }
  return null;
}

export { isOkxConfigured };
export type { OkxCredentials };
