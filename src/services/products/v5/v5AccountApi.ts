/**
 * v5AccountApi.ts — 账户余额与持仓 API
 */
import type { ApiResponse } from "../../../types/api";
import { getAccountBalance, type OkxBalanceItem } from "../../okxApi";
import { loadOkxCredentials } from "../../../config/okx";

export type AccountAsset = {
  symbol: string;
  balance: string;
  available: string;
  eqUsd: string;
};

export async function getAccountAssets(): Promise<ApiResponse<{ assets: AccountAsset[] }>> {
  try {
    const items = await getAccountBalance();
    const assets: AccountAsset[] = items
      .filter((i) => parseFloat(i.bal) > 0)
      .map((i) => ({
        symbol: i.ccy,
        balance: i.bal,
        available: i.availBal,
        eqUsd: i.eqUsd || "0",
      }));
    return { ok: true, simulationMode: false, data: { assets } };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}

export type AccountPosition = {
  instId: string;
  posSide: string;
  pos: string;
  avgPx: string;
  upl: string;
  lever: string;
  mgnMode: string;
};

export async function getAccountPositions(): Promise<ApiResponse<{ positions: AccountPosition[] }>> {
  const creds = loadOkxCredentials();
  if (!creds) return { ok: false, simulationMode: false, errorCode: "NO_CREDS", errorMsg: "OKX credentials not configured" };

  try {
    // 直接调用 OKX V5 positions endpoint
    const { sha256 } = await import("js-sha256");
    const ts = new Date().toISOString();
    const path = "/api/v5/account/positions";
    const prehash = ts + "GET" + path + "";
    const bytes = sha256.hmac.array(creds.apiSecret, prehash);
    // base64 encode
    const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let sign = "";
    const u8 = new Uint8Array(bytes);
    let i = 0;
    for (; i + 2 < u8.length; i += 3) {
      const a = u8[i], b = u8[i+1], c = u8[i+2];
      sign += B64[a>>2] + B64[((a&3)<<4)|(b>>4)] + B64[((b&15)<<2)|(c>>6)] + B64[c&63];
    }
    if (i < u8.length) {
      const a = u8[i], b = i+1 < u8.length ? u8[i+1] : 0;
      sign += B64[a>>2] + B64[((a&3)<<4)|(b>>4)];
      sign += i+1 < u8.length ? B64[(b&15)<<2] : "=";
      sign += "=";
    }

    const resp = await fetch("https://www.okx.com" + path, {
      headers: {
        "OK-ACCESS-KEY": creds.apiKey,
        "OK-ACCESS-SIGN": sign,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": creds.passphrase,
        "Content-Type": "application/json",
      },
    });
    const json = await resp.json();
    if (json?.code === "0") {
      const positions: AccountPosition[] = (json.data || []).map((p: any) => ({
        instId: p.instId,
        posSide: p.posSide,
        pos: p.pos,
        avgPx: p.avgPx,
        upl: p.upl,
        lever: p.lever,
        mgnMode: p.mgnMode,
      }));
      return { ok: true, simulationMode: false, data: { positions } };
    }
    return { ok: false, simulationMode: false, errorCode: json?.code, errorMsg: json?.msg };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}
