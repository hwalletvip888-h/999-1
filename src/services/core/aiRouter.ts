// AI Router mock
import type { ProductLine, V5Module, V6Module, CardType } from "../../types/product";
import type { IntentType } from "../../types/intent";

export interface AiRouteResult {
  productLine: ProductLine;
  module: V5Module | V6Module;
  intent: IntentType;
  cardType: CardType;
}

/**
 * 根据用户输入简单 mock 路由
 */

export function aiRoute(userInput: string): AiRouteResult {
  // 输入标准化
  const normalized = userInput
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/ｕ/g, "u");

  // 行情查询
  if ((/btc|eth/.test(normalized)) &&
      (/价格|行情|今日|查询/.test(normalized))) {
    return {
      productLine: "v5",
      module: "market",
      intent: "info",
      cardType: "info"
    };
  }

  // V5 永续合约
  if ((/永续|合约/.test(normalized)) &&
      (/eth|btc/.test(normalized)) &&
      (/做多|做空|开/.test(normalized))) {
    return {
      productLine: "v5",
      module: "perpetual",
      intent: "trade",
      cardType: "trade"
    };
  }

  // V5 网格
  if ((/网格|grid/.test(normalized)) &&
      (/eth|btc/.test(normalized))) {
    return { productLine: "v5", module: "grid", intent: "strategy", cardType: "strategy" };
  }

  // V6 兑换
  if ((/swap|兑换/.test(normalized))) {
    return { productLine: "v6", module: "swap", intent: "swap", cardType: "trade" };
  }

  // V6 赚币
  if ((/赚币|earn|质押|stake/.test(normalized))) {
    return { productLine: "v6", module: "earn", intent: "earn", cardType: "strategy" };
  }

  // V6 钱包
  if ((/钱包|wallet/.test(normalized))) {
    return { productLine: "v6", module: "wallet", intent: "wallet", cardType: "info" };
  }

  // clarify
  if (/帮我买eth|帮我买btc/.test(normalized)) {
    return { productLine: "clarify" as any, module: "clarify" as any, intent: "clarify", cardType: "info" };
  }

  // 默认 fallback
  return { productLine: "v5", module: "market", intent: "info", cardType: "info" };
}
