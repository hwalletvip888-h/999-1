// 风控接口 mock
import type { ApiResponse } from "../../types/api";
import type { RiskPrecheckParams, RiskPrecheckResult } from "../../types/risk";

export function riskPrecheck(
  input: RiskPrecheckParams
): ApiResponse<RiskPrecheckResult> {
  // mock 风控逻辑
  let riskScore = 20;
  let riskLevel: "low" | "medium" | "high" = "low";
  let suggestion = "通过";
  if (input.operationType === "transfer" && input.params.amount > 10000) {
    riskScore = 80;
    riskLevel = "high";
    suggestion = "大额转账，建议分批操作";
  }
  if (input.operationType === "trade" && input.params.leverage > 10) {
    riskScore = 60;
    riskLevel = "medium";
    suggestion = "高杠杆，注意风险";
  }
  return {
    ok: true,
    simulationMode: true,
    data: { riskScore, riskLevel, suggestion }
  };
}
