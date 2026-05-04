export type OkxCredentials = {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  /** true → 走 OKX Demo Trading（带 x-simulated-trading: 1 头部） */
  simulated?: boolean;
  /**
   * OKX 开发者平台 → Builder Code（X Layer 上的项目归因码）
   * 所有走 OKX Onchain / DEX 路由的链上交易会带上这个 code，
   * 后台才能统计到你这个项目的用量。可选。
   */
  builderCode?: string;
  /** Builder Code 对应的收款地址（OKX 后台展示用，链上不强制） */
  builderPayoutAddress?: string;
};

/**
 * 占位实现：当 okx.local.ts 不存在时，loadOkxCredentials 返回 null，
 * 应用自动回落到 MockMarketFeed，永远不会因为缺 key 崩溃。
 */
export function isOkxConfigured(c: OkxCredentials | null): c is OkxCredentials {
  return !!c && !!c.apiKey && !!c.apiSecret && !!c.passphrase;
}
