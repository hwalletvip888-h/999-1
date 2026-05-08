/**
 * okx.ts —— 凭证加载入口（可提交）
 *
 * 通过 require 动态尝试加载本地未提交的 okx.local.ts。
 * 如果用户没建那个文件，返回 null，应用走 mock。
 */

import { isOkxConfigured, type OkxCredentials } from "./okxTypes";

/**
 * 加载 OKX 凭证：优先 named export `OKX_CONFIG`（与 gateway.ts / okxClient.ts 一致），
 * 退化到 `okxCredentials`（向后兼容旧模板）。两种命名都支持 secretKey 字段。
 * 文件缺失时返回 null，App 自动走 mock。
 */
export function loadOkxCredentials(): OkxCredentials | null {
  try {
    // 关键：require 在 Metro 打包时如果文件不存在会抛错，
    // 我们用 try/catch 兜住，缺失即视为未配置。
    // 注意：路径必须是字面量，Metro 才能静态分析。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("./okx.local");
    const c: OkxCredentials | undefined = mod?.OKX_CONFIG ?? mod?.okxCredentials;
    return isOkxConfigured(c ?? null) ? c! : null;
  } catch {
    return null;
  }
}

export { isOkxConfigured };
export type { OkxCredentials };
