/**
 * 将用户传入的 AbortSignal 与超时控制器合并：任一 abort 则下游 fetch 所用 signal 终止。
 * 独立文件，避免被 Vitest 间接 import 到 Expo / react-native。
 */
export function mergeUserSignalWithTimeout(
  user: AbortSignal | undefined | null,
  timeout: AbortSignal,
): AbortSignal {
  if (!user) return timeout;
  if (user.aborted) {
    const c = new AbortController();
    c.abort(user.reason);
    return c.signal;
  }
  if (timeout.aborted) {
    const c = new AbortController();
    c.abort(timeout.reason);
    return c.signal;
  }
  const merged = new AbortController();
  const forward = (source: AbortSignal) => {
    try {
      merged.abort(source.reason);
    } catch {
      merged.abort();
    }
  };
  user.addEventListener("abort", () => forward(user), { once: true });
  timeout.addEventListener("abort", () => forward(timeout), { once: true });
  return merged.signal;
}
