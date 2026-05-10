/**
 * OKX Web3 签名 REST（用于旧版聚合余额 fallback 等）
 */
import * as crypto from "crypto";
import { OKX_API_KEY, OKX_BASE_URL, OKX_PASSPHRASE, OKX_PROJECT_ID, OKX_SECRET_KEY } from "./config";
import { fetchWithServerTimeout } from "./server-fetch";

function signRequest(timestamp: string, method: string, path: string, body: string): string {
  const signStr = `${timestamp}${method}${path}${body}`;
  return crypto.createHmac("sha256", OKX_SECRET_KEY).update(signStr).digest("base64");
}

export async function okxSignedRequest(method: string, path: string, body?: any): Promise<any> {
  const timestamp = new Date().toISOString().replace(/\d{3}Z$/, "000Z");
  const bodyStr = body ? JSON.stringify(body) : "";
  const sign = signRequest(timestamp, method, path, bodyStr);
  const url = `${OKX_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": OKX_API_KEY,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
    "OK-ACCESS-PROJECT": OKX_PROJECT_ID,
  };
  const response = await fetchWithServerTimeout(url, {
    method,
    headers,
    body: bodyStr || undefined,
  });
  return response.json();
}
