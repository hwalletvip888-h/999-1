import { getEffectiveAiRateLimitMax, getEffectiveAiRateLimitWindowMs } from "./runtime-settings";

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

/**
 * 超限返回 true（应拒绝）；否则递增并返回 false。
 */
export function isAiRouteRateLimited(clientKey: string): boolean {
  const max = getEffectiveAiRateLimitMax();
  const windowMs = getEffectiveAiRateLimitWindowMs();
  if (max <= 0) {
    return false;
  }
  const now = Date.now();
  let b = buckets.get(clientKey);
  if (!b || now - b.windowStart >= windowMs) {
    b = { count: 1, windowStart: now };
    buckets.set(clientKey, b);
    return false;
  }
  b.count += 1;
  if (b.count > max) {
    return true;
  }
  return false;
}

/** 运营台只读：当前内存中限流桶数量（不含各 IP 具体计数，避免泄露） */
export function getAiRateLimitStats(): { bucketCount: number; max: number; windowMs: number } {
  return {
    bucketCount: buckets.size,
    max: getEffectiveAiRateLimitMax(),
    windowMs: getEffectiveAiRateLimitWindowMs(),
  };
}
