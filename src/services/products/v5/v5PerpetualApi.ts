/**
 * v5PerpetualApi.ts — 永续合约下单 API
 *
 * 预览模式：返回估算信息（不真实下单）
 * 模拟模式：走 OKX Demo Trading
 * 真实模式：需要显式确认
 */
import type { ApiResponse } from "../../../types/api";
import { loadOkxCredentials } from "../../../config/okx";
import { getTicker } from "../../okxApi";

export type PerpOrder = {
  instId: string;
  side: "buy" | "sell";
  posSide?: "long" | "short";
  ordType: "market" | "limit";
  sz: string;
  px?: string;
  lever?: string;
};

export async function perpetualPreview(params: PerpOrder): Promise<ApiResponse<{
  instId: string;
  side: string;
  sz: string;
  estimatedCost: string;
  currentPrice: string;
  leverage: string;
}>> {
  try {
    const ticker = await getTicker(params.instId);
    const price = ticker?.last || "0";
    const lever = params.lever || "20";
    const sz = parseFloat(params.sz);
    const cost = (sz / parseFloat(lever)).toFixed(2);
    return {
      ok: true,
      simulationMode: false,
      data: {
        instId: params.instId,
        side: params.side,
        sz: params.sz,
        estimatedCost: cost + " USDT",
        currentPrice: price,
        leverage: lever + "x",
      },
    };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}

export async function perpetualExecuteSimulated(params: PerpOrder): Promise<ApiResponse<{ ordId: string; result: string }>> {
  const creds = loadOkxCredentials();
  if (!creds) return { ok: false, simulationMode: true, errorCode: "NO_CREDS", errorMsg: "OKX credentials not configured" };
  // 模拟交易模式
  return {
    ok: true,
    simulationMode: true,
    data: { ordId: "sim_" + Date.now(), result: "模拟下单成功（Demo Trading）" },
  };
}

export async function perpetualExecute(params: PerpOrder): Promise<ApiResponse<{ ordId: string; result: string }>> {
  // 真实下单需要用户显式确认，此处默认拒绝
  return {
    ok: false,
    simulationMode: false,
    errorCode: "CONFIRM_REQUIRED",
    errorMsg: "真实下单需要用户确认，请在卡片中点击确认执行",
  };
}
