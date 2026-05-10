import { getEffectiveCorsAllowedOrigins } from "./runtime-settings";

/**
 * 解析 CORS Allow-Origin：`*` 或逗号分隔白名单；白名单且带 Origin 时仅回显匹配的 Origin。
 */
export function resolveCorsAllowOrigin(requestOrigin: string | undefined): string {
  const raw = getEffectiveCorsAllowedOrigins().trim();
  if (!raw || raw === "*") {
    return "*";
  }
  const list = raw
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  if (list.length === 0) {
    return "*";
  }
  if (requestOrigin && list.includes(requestOrigin)) {
    return requestOrigin;
  }
  return list[0]!;
}
