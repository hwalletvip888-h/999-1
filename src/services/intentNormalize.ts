/**
 * 对话意图 — 单一事实来源
 *
 * - **白名单与别名**：`sanitizeIntentPayload` 将任意 LLM/兜底 JSON 压成合法 `AIIntent`
 * - **本地关键词兜底**：`buildLocalRuleIntentPayload` 仅一份实现，供 BFF（aiChat）与 App 无网时（claudeAI）共用，避免两套规则漂移
 */

export const CHAT_INTENT_ACTIONS = [
  "price",
  "trade_long",
  "trade_short",
  "grid",
  "swap",
  "earn",
  "position",
  "portfolio",
  "address",
  "transfer",
  "signal",
  "chat",
] as const;

export type ChatIntentAction = (typeof CHAT_INTENT_ACTIONS)[number];

/** 供 LLM system prompt 使用，与 `CHAT_INTENT_ACTIONS` 同步，勿在别处手写另一份枚举 */
export const CHAT_INTENT_ACTION_PROMPT_LITERAL = CHAT_INTENT_ACTIONS.join("|");

const ACTION_SET = new Set<string>(CHAT_INTENT_ACTIONS);

/** 模型常见别名 → 白名单 action（与 prompt 中的英文同义说法对齐） */
const ACTION_ALIASES: Record<string, ChatIntentAction> = {
  market: "price",
  ticker: "price",
  quote: "price",
  long: "trade_long",
  open_long: "trade_long",
  short: "trade_short",
  open_short: "trade_short",
  perp: "trade_long",
  perpetual: "trade_long",
  balance: "portfolio",
  balances: "portfolio",
  wallet: "portfolio",
  assets: "portfolio",
  signals: "signal",
  smart_money: "signal",
  smartmoney: "signal",
  opportunities: "signal",
  opportunity: "signal",
  discover: "signal",
  "trade-long": "trade_long",
  "trade-short": "trade_short",
  tradelong: "trade_long",
  tradeshort: "trade_short",
  deposit: "address",
  receive: "address",
  addresses: "address",
  recharge: "address",
  withdraw: "transfer",
  send: "transfer",
  "transfer-token": "transfer",
};

function isNonProductionLog(): boolean {
  if (typeof __DEV__ !== "undefined") {
    return __DEV__;
  }
  return process.env.NODE_ENV !== "production";
}

function coerceAction(raw: unknown): ChatIntentAction {
  if (typeof raw !== "string") {
    return "chat";
  }
  const k = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (ACTION_SET.has(k)) {
    return k as ChatIntentAction;
  }
  const alias = ACTION_ALIASES[k];
  if (alias) {
    return alias;
  }
  if (isNonProductionLog()) {
    console.warn("[intentNormalize] unknown action, coerced to chat:", raw);
  }
  return "chat";
}

export interface AIIntent {
  action: ChatIntentAction;
  symbol?: string;
  amount?: number;
  leverage?: number;
  protocol?: string;
  toAddress?: string;
  chain?: string;
  reply: string;
}

/**
 * 将任意模型/兜底输出压成合法 AIIntent（未知 action → chat，数值越界剔除）
 */
export function sanitizeIntentPayload(raw: unknown): AIIntent {
  const base = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  const action = coerceAction(base.action);

  let symbol: string | undefined;
  if (typeof base.symbol === "string") {
    const s = base.symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (s.length >= 2 && s.length <= 20) {
      symbol = s;
    }
  }

  let amount: number | undefined;
  if (base.amount !== undefined && base.amount !== null && base.amount !== "") {
    const n = Number(base.amount);
    if (Number.isFinite(n) && n >= 0 && n <= 1e12) {
      amount = n;
    }
  }

  let leverage: number | undefined;
  if (base.leverage !== undefined && base.leverage !== null && base.leverage !== "") {
    const n = Math.round(Number(base.leverage));
    if (Number.isFinite(n) && n >= 1 && n <= 125) {
      leverage = n;
    }
  }

  let protocol: string | undefined;
  if (typeof base.protocol === "string") {
    const p = base.protocol.trim();
    if (p.length > 0 && p.length <= 64) {
      protocol = p;
    }
  }

  let toAddress: string | undefined;
  if (typeof base.toAddress === "string") {
    const a = base.toAddress.trim();
    if (a.length >= 20) toAddress = a;
  }

  let chain: string | undefined;
  if (typeof base.chain === "string") {
    chain = base.chain.trim().toLowerCase() || undefined;
  }

  let reply = "";
  if (typeof base.reply === "string") {
    reply = base.reply;
  } else if (base.reply != null) {
    reply = String(base.reply);
  }

  return { action, symbol, amount, leverage, protocol, toAddress, chain, reply };
}

/**
 * 无 LLM 时的关键词意图（原始对象，须经 `sanitizeIntentPayload`）
 * 顺序敏感：signal 须在 earn 之前；合约类须在 grid 之前单独命中 trade_long
 */
export function buildLocalRuleIntentPayload(input: string): Record<string, unknown> {
  const lower = input.toLowerCase().replace(/\s+/g, "");

  let symbol = "BTC";
  if (/eth|以太/.test(lower)) symbol = "ETH";
  if (/sol/.test(lower)) symbol = "SOL";
  if (/doge/.test(lower)) symbol = "DOGE";

  const amtMatch = input.match(/(\d+(?:\.\d+)?)\s*(u|usdt)?/i);
  const amount = amtMatch ? parseFloat(amtMatch[1]) : 100;
  const levMatch = input.match(/(\d+)\s*[xX]/);
  const leverage = levMatch ? parseInt(levMatch[1], 10) : 10;

  if (/充值|收款|我的地址|转入|存入|recharge|deposit|receive|收币|收款地址|充值地址/.test(lower)) {
    return { action: "address", reply: "" };
  }
  if (/提现|转账|转给|发送|send|withdraw|转出/.test(lower)) {
    const addrMatch = input.match(/0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}/);
    const toAddress = addrMatch?.[0];
    const chain = toAddress?.startsWith("0x") ? "evm" : toAddress ? "solana" : undefined;
    return { action: "transfer", symbol: "USDT", amount, toAddress, chain, reply: "" };
  }
  if (/价格|行情|多少钱|今日|查一下/.test(lower)) {
    return { action: "price", symbol, reply: "" };
  }
  if (/做多|long|开多/.test(lower)) {
    return { action: "trade_long", symbol, amount, leverage, reply: "" };
  }
  if (/做空|short|开空/.test(lower)) {
    return { action: "trade_short", symbol, amount, leverage, reply: "" };
  }
  if (/合约|永续|开仓/.test(lower)) {
    return { action: "trade_long", symbol, amount, leverage, reply: "" };
  }
  if (/网格|grid|策略/.test(lower)) {
    return { action: "grid", symbol, amount, reply: "" };
  }
  if (/兑换|swap|换成|买入/.test(lower)) {
    return { action: "swap", symbol, amount, reply: "" };
  }
  if (
    /机会|信号|聪明钱|smart\s*money|链上(赚|赚币)?|发现|推荐|找(币|机会|项目)|kol|战壕|trenches/.test(lower)
  ) {
    return { action: "signal", reply: "" };
  }
  if (/赚币|earn|质押|stake|理财|apy/.test(lower)) {
    const isEth = /eth|以太/.test(lower);
    return {
      action: "earn",
      symbol: isEth ? "ETH" : "USDT",
      amount,
      protocol: isEth ? "Lido" : "Aave",
      reply: "",
    };
  }
  if (/持仓|仓位|position/.test(lower)) {
    return { action: "position", reply: "" };
  }
  if (/资产|余额|balance|总资产/.test(lower)) {
    return { action: "portfolio", reply: "" };
  }
  return { action: "chat", reply: "" };
}

/** BFF 与 App 共用的本地规则意图（已 sanitize） */
export function localRuleIntent(input: string): AIIntent {
  return sanitizeIntentPayload(buildLocalRuleIntentPayload(input));
}
