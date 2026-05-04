// 意图与路由类型
type ProductLine = "v5" | "v6";

type V5Module = "market" | "account" | "perpetual" | "grid";
type V6Module = "wallet" | "swap" | "earn" | "security";

export type IntentType =
  | "trade"
  | "strategy"
  | "info"
  | "wallet"
  | "swap"
  | "earn"
  | "security"
  | "clarify";

export interface RouteProductResult {
  productLine: ProductLine | "clarify";
  module?: V5Module | V6Module;
  intent: IntentType;
  cardType: "trade" | "strategy" | "info";
}
