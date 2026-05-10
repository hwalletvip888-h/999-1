/**
 * H Wallet 后端根 URL（无 AsyncStorage、无会话依赖，供 HTTP 层与 onchain 客户端共用）
 * 不设默认域名：请在 `EXPO_PUBLIC_HWALLET_API_BASE`、EAS env 或 `expo.extra.hwalletApiBase` 中显式配置。
 */
import Constants from "expo-constants";

export function getHwalletApiBase(): string {
  const a = String(process.env.EXPO_PUBLIC_HWALLET_API_BASE ?? "").trim();
  const b = String(process.env.HWALLET_API_BASE ?? "").trim();
  const c = String((Constants.expoConfig?.extra as { hwalletApiBase?: string } | undefined)?.hwalletApiBase ?? "").trim();
  return (a || b || c).replace(/\/+$/, "");
}

export function hwalletAbsoluteUrl(path: string): string | null {
  const base = getHwalletApiBase();
  if (!base) return null;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
