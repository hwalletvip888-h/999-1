/**
 * okxHttpCore — OKX HTTP 中性传输层（无产品线归属）
 *
 * ⚠️ 命名锁定（H_Wallet_V5_V6_Product_Skills.md）：
 *   - V5 = 交易所 / 合约策略 → 业务方法在 okxClient.ts
 *   - V6 = Onchain OS / 链上赚币 → 业务方法在 okxOnchainClient.ts
 *   - 本文件只提供「传输 + 签名」原语，V5 / V6 都从这里拿 request()
 *   - 任何 V6 服务都不应再 import okxClient（V5 的业务文件）
 *
 * 提供：
 *   - OkxCredentials / OkxResponse 类型
 *   - sign(): HMAC-SHA256 + Base64
 *   - request(): fetch + 超时 + 自动签名（creds 可选）
 */
import CryptoJS from "crypto-js";

// ─── 类型 ──────────────────────────────────────────────────────

export interface OkxCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

export interface OkxResponse<T = any> {
  code: string;
  msg: string;
  data: T;
}

// ─── 配置 ──────────────────────────────────────────────────────

export const OKX_BASE_URL = "https://www.okx.com";
const TIMEOUT_MS = 15000;

// ─── 签名 ──────────────────────────────────────────────────────

export function sign(
  timestamp: string,
  method: string,
  path: string,
  body: string,
  secretKey: string
): string {
  const msg = timestamp + method + path + body;
  const hash = CryptoJS.HmacSHA256(msg, secretKey);
  return CryptoJS.enc.Base64.stringify(hash);
}

// ─── 通用请求 ───────────────────────────────────────────────────

export async function request<T = any>(
  method: "GET" | "POST",
  path: string,
  creds?: OkxCredentials | null,
  body?: Record<string, any>
): Promise<OkxResponse<T>> {
  const ts = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : "";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (creds) {
    headers["OK-ACCESS-KEY"] = creds.apiKey;
    headers["OK-ACCESS-SIGN"] = sign(ts, method, path, bodyStr, creds.secretKey);
    headers["OK-ACCESS-TIMESTAMP"] = ts;
    headers["OK-ACCESS-PASSPHRASE"] = creds.passphrase;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${OKX_BASE_URL}${path}`, {
      method,
      headers,
      body: method === "POST" && bodyStr ? bodyStr : undefined,
      signal: controller.signal,
    });
    const json = await res.json();
    return json as OkxResponse<T>;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`[OKX] 请求超时: ${method} ${path}`);
    }
    throw new Error(`[OKX] 请求失败: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}
