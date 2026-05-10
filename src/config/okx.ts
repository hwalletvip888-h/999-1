/**
 * okx.ts — 凭证加载入口（可提交）
 *
 * 不在仓库内嵌生产 OKX CEX 密钥；CEX 账户经 BFF（`EXPO_PUBLIC_HWALLET_API_BASE`）与服务器环境变量。
 * 本地开发在 `okx.local.ts` 提供 `OKX_CONFIG` / `okxCredentials`。
 * 若凭证为空，返回 null，应用走 mock（或仅依赖 BFF 的接口仍可用）。
 */
import { isOkxConfigured, type OkxCredentials } from "./okxTypes";

/** 不在 App 内嵌 OKX CEX 密钥；CEX 账户经 BFF + 服务器环境变量。本地开发用 `okx.local.ts`。 */
const BUILT_IN_CREDENTIALS: OkxCredentials = {
  apiKey: "",
  apiSecret: "",
  passphrase: "",
  simulated: false,
  builderCode: "",
};

export function loadOkxCredentials(): OkxCredentials | null {
  if (isOkxConfigured(BUILT_IN_CREDENTIALS)) {
    return BUILT_IN_CREDENTIALS;
  }
  return null;
}

export { isOkxConfigured };
export type { OkxCredentials };
