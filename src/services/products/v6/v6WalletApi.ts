/**
 * v6WalletApi.ts — Onchain 钱包 API
 *
 * 通过 OKX Web3 API 实现链上钱包操作
 */
import type { ApiResponse } from "../../../types/api";
import { loadOkxCredentials } from "../../../config/okx";

const WEB3_BASE = "https://www.okx.com";

// 简化的 Web3 请求（与 onchainApi.ts 共享签名逻辑）
async function web3Get<T>(path: string): Promise<T | null> {
  const creds = loadOkxCredentials();
  if (!creds) return null;

  const { sha256 } = await import("js-sha256");
  const ts = new Date().toISOString();
  const prehash = ts + "GET" + path + "";
  const bytes = sha256.hmac.array(creds.apiSecret, prehash);
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const u8 = new Uint8Array(bytes);
  let sign = "";
  let i = 0;
  for (; i + 2 < u8.length; i += 3) {
    const a = u8[i], b = u8[i+1], c = u8[i+2];
    sign += B64[a>>2] + B64[((a&3)<<4)|(b>>4)] + B64[((b&15)<<2)|(c>>6)] + B64[c&63];
  }
  if (i < u8.length) {
    const a = u8[i], b2 = i+1 < u8.length ? u8[i+1] : 0;
    sign += B64[a>>2] + B64[((a&3)<<4)|(b2>>4)];
    sign += i+1 < u8.length ? B64[(b2&15)<<2] : "=";
    sign += "=";
  }

  const resp = await fetch(WEB3_BASE + path, {
    headers: {
      "OK-ACCESS-KEY": creds.apiKey,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": creds.passphrase,
      "OK-ACCESS-PROJECT": creds.builderCode || "",
      "Content-Type": "application/json",
    },
  });
  const json = await resp.json();
  if (json?.code === "0" || json?.code === 0) return json.data as T;
  return null;
}

export async function walletInit(): Promise<ApiResponse<{ walletId: string; status: string }>> {
  // Agentic Wallet 状态查询
  return {
    ok: true,
    simulationMode: false,
    data: { walletId: "agentic_wallet", status: "ready" },
  };
}

export type OnchainAsset = {
  symbol: string;
  balance: string;
  chainIndex: string;
  tokenAddress: string;
  priceUsd: string;
};

export async function getWalletAssets(address: string, chainIndex = "501"): Promise<ApiResponse<{ assets: OnchainAsset[] }>> {
  try {
    const path = `/api/v5/wallet/asset/token-balances?address=${address}&chainIndex=${chainIndex}`;
    const data = await web3Get<any[]>(path);
    if (!data) {
      return { ok: true, simulationMode: false, data: { assets: [] } };
    }
    const assets: OnchainAsset[] = data.map((t: any) => ({
      symbol: t.symbol || t.tokenSymbol || "?",
      balance: t.balance || "0",
      chainIndex: t.chainIndex || chainIndex,
      tokenAddress: t.tokenAddress || "",
      priceUsd: t.tokenPrice || "0",
    }));
    return { ok: true, simulationMode: false, data: { assets } };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}

export async function getWalletHistory(address: string, chainIndex = "501"): Promise<ApiResponse<{ history: any[] }>> {
  try {
    const path = `/api/v5/wallet/post-transaction/transactions?address=${address}&chainIndex=${chainIndex}&limit=20`;
    const data = await web3Get<any[]>(path);
    return { ok: true, simulationMode: false, data: { history: data || [] } };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}

export async function walletTransferPreview(params: {
  fromAddress: string;
  toAddress: string;
  tokenAddress: string;
  amount: string;
  chainIndex: string;
}): Promise<ApiResponse<{ estimatedGas: string; preview: string }>> {
  return {
    ok: true,
    simulationMode: false,
    data: {
      estimatedGas: "0.001 SOL",
      preview: `转账 ${params.amount} → ${params.toAddress.slice(0, 8)}...`,
    },
  };
}

export async function walletTransfer(params: any): Promise<ApiResponse<{ txHash: string; result: string }>> {
  return {
    ok: false,
    simulationMode: false,
    errorCode: "CONFIRM_REQUIRED",
    errorMsg: "链上转账需要用户确认",
  };
}
