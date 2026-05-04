// 产品线与模块类型定义

export type ProductLine = "v5" | "v6";

export type V5Module =
  | "market"
  | "account"
  | "perpetual"
  | "grid";

export type V6Module =
  | "wallet"
  | "swap"
  | "earn"
  | "security";

export type CardType = "trade" | "strategy" | "info";

// 新增：所有产品模块类型联合
export type ProductModule = V5Module | V6Module;


