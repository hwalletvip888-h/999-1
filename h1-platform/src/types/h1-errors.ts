/**
 * H1 错误码与 trace：与 docs/H_WALLET_PRODUCT_DEV_REQUIREMENTS.md §6 / §2.1 C 对齐。
 * 用户可见文案由 userMessageKey 映射，不直接暴露 code。
 */
export type H1ErrorSource = "OKX" | "ORC" | "EXP" | "ENG" | "PRT" | "PLT" | "SEC";

export function h1ErrorCode(source: H1ErrorSource, code: string): string {
  return `H1.${source}.${code}`;
}

export type TraceId = string;

export interface H1Failure {
  code: string;
  userMessageKey: string;
}
