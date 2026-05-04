/**
 * v6SwapApi.ts — DEX 聚合器兑换 API
 *
 * 使用 OKX DEX Aggregator 接口获取报价和执行兑换
 */
import type { ApiResponse } from "../../../types/api";
import { getSwapQuote, type SwapQuote } from "../../onchainApi";

export type SwapParams = {
  chainIndex: string;
  fromToken: string;  // token address
  toToken: string;    // token address
  amount: string;     // in smallest unit
  slippage?: string;  // percentage e.g. "0.5"
};

export async function swapPreview(params: SwapParams): Promise<ApiResponse<{
  fromToken: string;
  toToken: string;
  amount: string;
  estimatedOutput: string;
  estimatedGas: string;
}>> {
  try {
    const quote = await getSwapQuote({
      chainIndex: params.chainIndex,
      fromTokenAddress: params.fromToken,
      toTokenAddress: params.toToken,
      amount: params.amount,
      slippage: params.slippage,
    });
    if (!quote) {
      return { ok: false, simulationMode: false, errorCode: "NO_ROUTE", errorMsg: "未找到兑换路由" };
    }
    return {
      ok: true,
      simulationMode: false,
      data: {
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: params.amount,
        estimatedOutput: quote.routerResult.toTokenAmount,
        estimatedGas: quote.routerResult.estimateGasFee,
      },
    };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}

export async function swapExecute(params: SwapParams): Promise<ApiResponse<{ txHash: string; result: string }>> {
  // 链上兑换需要用户确认
  return {
    ok: false,
    simulationMode: false,
    errorCode: "CONFIRM_REQUIRED",
    errorMsg: "链上兑换需要用户确认签名",
  };
}
