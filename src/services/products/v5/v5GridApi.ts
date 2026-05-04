/**
 * v5GridApi.ts — 网格策略 API
 *
 * 支持 AI 参数推荐 + 预览 + 启动/停止
 */
import type { ApiResponse } from "../../../types/api";
import { getGridAiParams, type GridAiParams } from "../../onchainApi";

export type GridParams = {
  instId: string;
  direction?: "long" | "short" | "neutral";
  gridNum?: number;
  maxPx?: string;
  minPx?: string;
  totalAmount?: string;
};

/**
 * 获取 AI 推荐网格参数
 */
export async function gridAiRecommend(
  instId: string,
  direction: "long" | "short" | "neutral" = "neutral"
): Promise<ApiResponse<GridAiParams>> {
  try {
    const params = await getGridAiParams(instId, direction);
    if (!params) {
      return { ok: false, simulationMode: false, errorCode: "NO_DATA", errorMsg: "AI 参数不可用" };
    }
    return { ok: true, simulationMode: false, data: params };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}

/**
 * 网格策略预览（包含 AI 参数）
 */
export async function gridPreview(params: GridParams): Promise<ApiResponse<{
  instId: string;
  direction: string;
  gridNum: string;
  maxPx: string;
  minPx: string;
  annualizedRate: string;
  totalAmount: string;
}>> {
  try {
    const dir = params.direction || "neutral";
    const ai = await getGridAiParams(params.instId, dir);
    const gridNum = params.gridNum?.toString() || ai?.gridNum || "50";
    const maxPx = params.maxPx || ai?.maxPx || "0";
    const minPx = params.minPx || ai?.minPx || "0";
    const apr = ai?.annualizedRate || "N/A";
    return {
      ok: true,
      simulationMode: false,
      data: {
        instId: params.instId,
        direction: dir,
        gridNum,
        maxPx,
        minPx,
        annualizedRate: apr,
        totalAmount: params.totalAmount || "500 USDT",
      },
    };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}

export async function gridStartSimulated(params: GridParams): Promise<ApiResponse<{ algoId: string; result: string }>> {
  return {
    ok: true,
    simulationMode: true,
    data: { algoId: "sim_grid_" + Date.now(), result: "网格策略模拟启动成功" },
  };
}

export async function gridStart(params: GridParams): Promise<ApiResponse<{ algoId: string; result: string }>> {
  return {
    ok: false,
    simulationMode: false,
    errorCode: "CONFIRM_REQUIRED",
    errorMsg: "真实启动网格需要用户确认",
  };
}

export async function gridStop(algoId: string): Promise<ApiResponse<{ result: string }>> {
  return {
    ok: false,
    simulationMode: false,
    errorCode: "CONFIRM_REQUIRED",
    errorMsg: "停止网格需要用户确认",
  };
}

export async function getGridOrders(): Promise<ApiResponse<{ orders: any[] }>> {
  // TODO: 调用 /api/v5/tradingBot/grid/orders-algo-pending
  return {
    ok: true,
    simulationMode: false,
    data: { orders: [] },
  };
}
