/**
 * v5MarketApi.ts — 真实 OKX V5 行情 API
 */
import type { ApiResponse } from "../../../types/api";
import { getTicker, getCandles, type OkxBar } from "../../okxApi";

export async function getMarketPrice(
  instId: string
): Promise<ApiResponse<{ symbol: string; price: string; high24h: string; low24h: string; vol24h: string; change24h: string }>> {
  try {
    const ticker = await getTicker(instId);
    if (!ticker) {
      return { ok: false, simulationMode: false, errorCode: "NO_DATA", errorMsg: "No ticker data" };
    }
    const open = parseFloat(ticker.open24h);
    const last = parseFloat(ticker.last);
    const changePct = open > 0 ? (((last - open) / open) * 100).toFixed(2) : "0";
    return {
      ok: true,
      simulationMode: false,
      data: {
        symbol: ticker.instId,
        price: ticker.last,
        high24h: ticker.high24h,
        low24h: ticker.low24h,
        vol24h: ticker.vol24h,
        change24h: changePct + "%",
      },
    };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}

export async function getMarketCandles(
  instId: string,
  bar: OkxBar = "15m",
  limit = 100
): Promise<ApiResponse<{ symbol: string; candles: { t: number; o: number; h: number; l: number; c: number; v: number }[] }>> {
  try {
    const candles = await getCandles(instId, bar, limit);
    return {
      ok: true,
      simulationMode: false,
      data: { symbol: instId, candles },
    };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}

export async function getFundingRate(
  instId: string
): Promise<ApiResponse<{ symbol: string; fundingRate: string; nextFundingTime: string }>> {
  try {
    const url = `https://www.okx.com/api/v5/public/funding-rate?instId=${encodeURIComponent(instId)}`;
    const resp = await fetch(url);
    const json = await resp.json();
    if (json?.code === "0" && json?.data?.length) {
      const d = json.data[0];
      return {
        ok: true,
        simulationMode: false,
        data: {
          symbol: instId,
          fundingRate: d.fundingRate || "0",
          nextFundingTime: d.nextFundingTime || "",
        },
      };
    }
    return { ok: false, simulationMode: false, errorCode: "NO_DATA", errorMsg: "No funding rate data" };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}
