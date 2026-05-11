/**
 * 策略层 Swap 解析工具 — 与 handleSwapQuoteViaCli / handleSwapExecuteViaCli 字段完全对齐
 */

/**
 * 解析 onchainos swap quote 的 CLI 原始输出。
 * CLI 返回形如：{ ok: true, data: [{ toTokenAmount, fromTokenAmount, dexRouterList, priceImpactPercentage }] }
 */
export function parseSwapQuoteResult(raw: any): {
  toAmount: number;
  fromAmount: number;
  priceImpactPct: number;
} | null {
  if (!raw || raw.ok === false) return null;
  const list = Array.isArray(raw.data) ? raw.data : [raw.data];
  const d: any = list[0] ?? {};
  const toDec   = Number(d?.dexRouterList?.[0]?.toToken?.decimal   ?? d?.toToken?.decimal   ?? 18);
  const fromDec = Number(d?.dexRouterList?.[0]?.fromToken?.decimal ?? d?.fromToken?.decimal ?? 18);
  const toRaw   = String(d?.toTokenAmount   ?? "");
  const fromRaw = String(d?.fromTokenAmount ?? "");
  if (!toRaw) return null;
  const toAmount   = Number(toRaw)   / Math.pow(10, toDec);
  const fromAmount = fromRaw ? Number(fromRaw) / Math.pow(10, fromDec) : 0;
  const priceImpactPct = Number(d?.priceImpactPercentage ?? d?.priceImpact ?? 0);
  if (!Number.isFinite(toAmount) || toAmount <= 0) return null;
  return { toAmount, fromAmount, priceImpactPct };
}

/**
 * 解析 onchainos swap execute 的 CLI 原始输出。
 * 返回 txHash 字符串，失败返回 null。
 */
export function parseSwapExecuteResult(raw: any): string | null {
  if (!raw || raw.ok === false) return null;
  const d = raw.data ?? raw ?? {};
  const txHash = String(d?.swapTxHash ?? d?.txHash ?? "").trim();
  return txHash || null;
}
