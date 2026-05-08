// 占位：真实风控需在服务端或与交易所账户联动后启用
import type { ApiResponse } from "../../types/api";
import type { RiskPrecheckParams, RiskPrecheckResult } from "../../types/risk";

export function riskPrecheck(
  _input: RiskPrecheckParams
): ApiResponse<RiskPrecheckResult> {
  return {
    ok: false,
    simulationMode: false,
    errorMsg: "风控预检需在服务端接通后启用。",
    data: { riskScore: 0, riskLevel: "medium", suggestion: "请稍后再试" },
  };
}
