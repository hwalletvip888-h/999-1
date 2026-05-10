import { AI_RATE_LIMIT_MAX, AI_RATE_LIMIT_WINDOW_MS } from "./config";

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

/**
 * 超限返回 true（应拒绝）；否则递增并返回 false。
 */
export function isAiRouteRateLimited(clientKey: string): boolean {
  if (AI_RATE_LIMIT_MAX <= 0) {
    return false;
  }
  const now = Date.now();
  let b = buckets.get(clientKey);
  if (!b || now - b.windowStart >= AI_RATE_LIMIT_WINDOW_MS) {
    b = { count: 1, windowStart: now };
    buckets.set(clientKey, b);
    return false;
  }
  b.count += 1;
  if (b.count > AI_RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

/** 运营台只读：当前内存中限流桶数量（不含各 IP 具体计数，避免泄露） */
export function getAiRateLimitStats(): { bucketCount: number; max: number; windowMs: number } {
  return {
    bucketCount: buckets.size,
    max: AI_RATE_LIMIT_MAX,
    windowMs: AI_RATE_LIMIT_WINDOW_MS,
  };
}
