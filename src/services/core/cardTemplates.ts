/**
 * 对话卡片模板注册表 — 单一事实来源（UI 分发、设计对齐、联调清单）
 * 与 `TransactionCard` 分发顺序保持一致；新增卡片时先改此处再改 UI。
 */
import type { HWalletCard } from "../../types/card";

export const CARD_TEMPLATE_IDS = [
  "transfer_select",
  "transfer",
  "transfer_receipt",
  "deposit",
  "price",
  "position",
  "portfolio",
  "perp_result",
  "perpetual",
  "swap",
  "stake",
  "grid",
  "agent",
  "signal",
  "generic",
] as const;

export type CardTemplateId = (typeof CARD_TEMPLATE_IDS)[number];

export type CardTemplateMeta = {
  id: CardTemplateId;
  /** 产品 / 设计用短名 */
  label: string;
  productLine: string;
  module: string;
  /** 用于识别该模板的关键字段（无则写 "-"） */
  requiredSignals: string[];
};

export const CARD_TEMPLATE_REGISTRY: Record<CardTemplateId, CardTemplateMeta> = {
  transfer_select: {
    id: "transfer_select",
    label: "转账 · 选地址",
    productLine: "v6",
    module: "wallet",
    requiredSignals: ["transferSelectMode", "cardType=wallet_action"],
  },
  transfer: {
    id: "transfer",
    label: "转账 · 确认",
    productLine: "v6",
    module: "wallet",
    requiredSignals: ["toAddress", "transferChain", "cardType=wallet_action", "amount", "symbol"],
  },
  transfer_receipt: {
    id: "transfer_receipt",
    label: "转账 · 成功回执",
    productLine: "v6",
    module: "wallet",
    requiredSignals: ["toAddress", "cardType=info", "status=executed", "rows?"],
  },
  deposit: {
    id: "deposit",
    label: "充值地址",
    productLine: "v6",
    module: "wallet",
    requiredSignals: ["depositAddresses[]", "cardType=info"],
  },
  price: {
    id: "price",
    label: "行情",
    productLine: "v5",
    module: "market",
    requiredSignals: ["priceData", "module=market"],
  },
  position: {
    id: "position",
    label: "合约持仓",
    productLine: "v5",
    module: "account",
    requiredSignals: ["positions[]", 'title="当前持仓"'],
  },
  portfolio: {
    id: "portfolio",
    label: "资产总览",
    productLine: "v5",
    module: "account",
    requiredSignals: ["balances[]", "totalEquity"],
  },
  perp_result: {
    id: "perp_result",
    label: "永续 · 成交结果",
    productLine: "v5",
    module: "perpetual",
    requiredSignals: ["module=perpetual", "cardType=info", "status=executed|failed"],
  },
  perpetual: {
    id: "perpetual",
    label: "永续 · 预览",
    productLine: "v5",
    module: "perpetual",
    requiredSignals: ["cardType=trade", "direction", "leverage"],
  },
  swap: {
    id: "swap",
    label: "链上兑换",
    productLine: "v6",
    module: "swap",
    requiredSignals: ["fromSymbol", "toSymbol", "fromAmount", "cardType=trade"],
  },
  stake: {
    id: "stake",
    label: "质押 / 赚币",
    productLine: "v6",
    module: "earn",
    requiredSignals: ["stakeProtocol", "stakeApy", "stakeAmount"],
  },
  grid: {
    id: "grid",
    label: "网格策略",
    productLine: "v5",
    module: "grid",
    requiredSignals: ["cardType=strategy", "module=grid"],
  },
  agent: {
    id: "agent",
    label: "Agent 策略卡",
    productLine: "v5",
    module: "earn",
    requiredSignals: ["cardType=strategy", "module=earn", "agentName?"],
  },
  signal: {
    id: "signal",
    label: "链上机会 / 信号",
    productLine: "v6",
    module: "earn 或 wallet",
    requiredSignals: ["cardType=signal", "signalSource?"],
  },
  generic: {
    id: "generic",
    label: "通用兜底",
    productLine: "v5",
    module: "*",
    requiredSignals: ["title", "rows?"],
  },
};

/**
 * 按与 `TransactionCard` 相同的优先级解析模板（先命中先返回）。
 */
export function resolveCardTemplateId(card: HWalletCard): CardTemplateId {
  if (card.transferSelectMode) return "transfer_select";

  if (
    card.toAddress &&
    card.module === "wallet" &&
    card.cardType === "wallet_action"
  ) {
    return "transfer";
  }

  if (
    card.module === "wallet" &&
    card.cardType === "info" &&
    card.status === "executed" &&
    card.toAddress &&
    (card.amount !== undefined && card.amount !== null) &&
    !card.depositAddresses?.length
  ) {
    return "transfer_receipt";
  }

  if (card.depositAddresses && card.module === "wallet" && card.cardType === "info") {
    return "deposit";
  }

  if (card.priceData && card.module === "market") return "price";

  if (card.positions !== undefined && card.module === "account" && card.title === "当前持仓") {
    return "position";
  }

  if (card.balances !== undefined && card.module === "account") return "portfolio";

  if (card.module === "perpetual" && card.cardType === "info" && (card.status === "executed" || card.status === "failed")) {
    return "perp_result";
  }

  if (card.cardType === "trade" && card.module === "perpetual") return "perpetual";

  if (card.cardType === "trade" && card.module === "swap") return "swap";

  if (card.module === "earn" && card.stakeProtocol) return "stake";

  if (card.cardType === "strategy" && card.module === "grid") return "grid";

  if (card.cardType === "strategy" && card.module === "earn") return "agent";

  if (card.cardType === "signal") return "signal";

  return "generic";
}

export function getCardTemplateMeta(id: CardTemplateId): CardTemplateMeta {
  return CARD_TEMPLATE_REGISTRY[id];
}
