export function isRetriableHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const sec = parseInt(h, 10);
  if (Number.isFinite(sec) && sec > 0) return Math.min(sec * 1000, 60_000);
  return null;
}

function backoffMs(attempt: number, baseMs: number, res?: Response): number {
  const ra = res ? retryAfterMs(res) : null;
  if (ra !== null) return ra;
  return Math.min(baseMs * 2 ** attempt, 8_000);
}

export type WalletHttpRetryOptions = {
  /** 最大额外重试次数（不含首次请求） */
  maxRetries: number;
  baseDelayMs?: number;
  /** 仅对 GET/HEAD 自动重试可恢复状态码；POST 默认不重试 */
  method: string;
};

/**
 * 对「同一 fetch 闭包」做有限次重试：网络失败或 429/502/503/504（仅安全方法）。
 */
export async function withHttpRetries(
  doFetch: () => Promise<Response>,
  opts: WalletHttpRetryOptions,
): Promise<Response> {
  const base = opts.baseDelayMs ?? 400;
  const method = (opts.method || "GET").toUpperCase();
  const allowRetry = method === "GET" || method === "HEAD";
  let last: Response | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const res = await doFetch();
      last = res;
      if (res.ok || !allowRetry || !isRetriableHttpStatus(res.status) || attempt === opts.maxRetries) {
        return res;
      }
      await sleep(backoffMs(attempt, base, res));
    } catch (e) {
      if (attempt === opts.maxRetries || !allowRetry) throw e;
      await sleep(backoffMs(attempt, base));
    }
  }
  return last as Response;
}

/** GET 默认重试次数（总请求数 = 1 + maxRetries） */
export const DEFAULT_GET_MAX_RETRIES = 2;
