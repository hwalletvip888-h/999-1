// 风控类型定义
export interface RiskPrecheckParams {
  operationType: string; // "transfer" | "trade" | "strategy" 等
  params: Record<string, any>;
}

export interface RiskPrecheckResult {
  riskScore: number; // 0-100
  riskLevel: "low" | "medium" | "high";
  suggestion: string;
}
