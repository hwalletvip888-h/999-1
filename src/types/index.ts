// 类型统一出口，兼容旧有 import
export type {
  CardStatus,
  CardType,
  CardHeader,
  HWalletCard,
  TradeCard,
  StrategyCard,
  Card
} from "./card";

// 兼容旧有 TradeCardCategory、TradeCardRow、Candle 类型（如有需要可在 card.ts 内补充定义）
export type TradeCardCategory = "perpetual" | "swap" | "agent" | "stake" | "earn" | "grid";
export type TradeCardRow = {
  label: string;
  value: string;
  accent?: "positive" | "negative" | "warning";
};
export type Candle = { o: number; h: number; l: number; c: number };

export type { SavedCard } from "../services/cardLibrary";
// AppView 顶部胶囊三段：对话 / 社区 / Agent；钱包从左滑入；个人中心从右滑入
export type AppView = "wallet" | "chat" | "community" | "agent" | "profile";

export type MessageRole = "user" | "assistant" | "system";

export type MessageKind = "text" | "card" | "steps";


import type { HWalletCard } from "./card";

export type AIStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  icon?: string; // emoji
};

export type ChatMessage = {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  text?: string;
  card?: HWalletCard;
  steps?: AIStep[];
  createdAt: string;
};

export type WalletAsset = {
  id: string;
  symbol: string;
  name: string;
  icon: string;
  chain: string;
  balance: string;
  valueUsd: string;
  change24h: string;
};

export type WalletAction = {
  id: string;
  label: string;
  icon: string;
};

export type WalletShortcut = {
  id: string;
  title: string;
  description: string;
};

export type CommunityMessage = {
  id: string;
  author: string;
  avatar: string;
  role?: "ai" | "member";
  text?: string;
  card?: {
    pair: string;
    direction: string;
    pnl: string;
    tag: string;
  };
  market?: MarketQuote;
  align?: "left" | "right";
};

export type MarketQuote = {
  pair: string;
  icon: string;
  price: string;
  change24h: string;
  trend: "up" | "down";
  spark: number[];
};

export type ProfileMenuItem = {
  id: string;
  label: string;
  icon: string;
  hasDot?: boolean;
};
