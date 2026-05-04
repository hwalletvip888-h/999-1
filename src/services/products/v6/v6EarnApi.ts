// V6 赚币 mock
import type { ApiResponse } from "../../../types/api";

export function getEarnProducts(): ApiResponse<{ products: any[] }> {
  return {
    ok: true,
    simulationMode: true,
    data: {
      products: [
        { productId: "earn_1", symbol: "ETH", apy: "5%" }
      ]
    }
  };
}

export function earnPreview(params: any): ApiResponse<{ preview: string }> {
  return {
    ok: true,
    simulationMode: true,
    data: { preview: "赚币预览 (mock)" }
  };
}

export function earnSubscribeSimulated(params: any): ApiResponse<{ result: string }> {
  return {
    ok: true,
    simulationMode: true,
    data: { result: "模拟赚币申购成功 (mock)" }
  };
}

export function earnSubscribe(params: any): ApiResponse<{ result: string }> {
  return {
    ok: false,
    simulationMode: true,
    errorCode: "NOT_IMPLEMENTED",
    errorMsg: "真实执行暂未开放"
  };
}

export function getEarnPositions(): ApiResponse<{ positions: any[] }> {
  return {
    ok: true,
    simulationMode: true,
    data: {
      positions: [
        { positionId: "pos_1", symbol: "ETH", amount: "1.2", status: "running" }
      ]
    }
  };
}
