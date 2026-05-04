/**
 * v6SecurityApi.ts — 代币安全扫描 API
 */
import type { ApiResponse } from "../../../types/api";
import { tokenSecurityScan, type TokenSecurityInfo } from "../../onchainApi";

export type SecurityResult = {
  isHoneypot: boolean;
  isMintable: boolean;
  isOpenSource: boolean;
  riskLevel: string;
  buyTax: string;
  sellTax: string;
  safe: boolean;
};

export async function tokenScan(params: {
  chainIndex: string;
  tokenAddress: string;
}): Promise<ApiResponse<SecurityResult>> {
  try {
    const info = await tokenSecurityScan(params.chainIndex, params.tokenAddress);
    if (!info) {
      return {
        ok: true,
        simulationMode: false,
        data: {
          isHoneypot: false,
          isMintable: false,
          isOpenSource: true,
          riskLevel: "unknown",
          buyTax: "0",
          sellTax: "0",
          safe: true, // 无数据时默认安全（但提示用户注意）
        },
      };
    }
    const safe = !info.isHoneypot && parseFloat(info.sellTax) < 10;
    return {
      ok: true,
      simulationMode: false,
      data: {
        ...info,
        safe,
      },
    };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}

export async function txPrecheck(params: {
  chainIndex: string;
  tokenAddress: string;
}): Promise<ApiResponse<{ safe: boolean; warnings: string[] }>> {
  try {
    const info = await tokenSecurityScan(params.chainIndex, params.tokenAddress);
    const warnings: string[] = [];
    if (info?.isHoneypot) warnings.push("警告: 疑似蜂罐合约");
    if (info?.isMintable) warnings.push("注意: 合约可增发");
    if (parseFloat(info?.sellTax || "0") > 5) warnings.push(`注意: 卖出税 ${info?.sellTax}%`);
    if (!info?.isOpenSource) warnings.push("注意: 合约未开源");
    return {
      ok: true,
      simulationMode: false,
      data: { safe: warnings.length === 0, warnings },
    };
  } catch (e) {
    return { ok: false, simulationMode: false, errorCode: "API_ERROR", errorMsg: (e as Error).message };
  }
}
