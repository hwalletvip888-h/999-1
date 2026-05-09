/**
 * H Wallet 后端根 URL（无 AsyncStorage、无会话依赖，供 HTTP 层与 onchain 客户端共用）
 */
import Constants from "expo-constants";

const DEFAULT_HWALLET_API_BASE = "https://api.hvip.io";

export function getHwalletApiBase(): string {
  const a = String(process.env.EXPO_PUBLIC_HWALLET_API_BASE ?? "").trim();
  const b = String(process.env.HWALLET_API_BASE ?? "").trim();
  const c = String((Constants.expoConfig?.extra as { hwalletApiBase?: string } | undefined)?.hwalletApiBase ?? "").trim();
  return (a || b || c || DEFAULT_HWALLET_API_BASE).replace(/\/+$/, "");
}

export function hwalletAbsoluteUrl(path: string): string | null {
  const base = getHwalletApiBase();
  if (!base) return null;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
