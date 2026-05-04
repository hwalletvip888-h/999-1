import type {
  ChatMessage,
  CommunityMessage,
  ProfileMenuItem,
  TradeCard,
  WalletAction,
  WalletAsset,
  WalletShortcut
} from "../types";

export const mockTradeCard: TradeCard = {
  id: "card_eth_perp_preview",
  category: "perpetual",
  productLine: "v5",
  module: "perpetual",
  cardType: "trade",
  header: "交易卡片",
  riskLevel: "中",
  status: "preview",
  simulationMode: true,
  userPrompt: "模拟指令",
  aiSummary: "AI 已为你生成交易卡片，请确认后再模拟执行。",
  createdAt: new Date().toISOString(),
  title: "ETH/USDT 永续合约",
  subtitle: "AI 已为你生成交易方案",
  symbol: "ETH/USDT",
  icon: "◆",
  rows: [
    { label: "方向", value: "做多", accent: "positive" },
    { label: "金额", value: "100 USDT" },
    { label: "杠杆", value: "10x", accent: "warning" },
    { label: "预估开仓价", value: "$3,842" },
    { label: "资金费率", value: "0.012%" }
  ],
  warning: "高杠杆交易风险较高。确认前请检查金额、方向与杠杆。",
  primaryAction: "确认交易",
  secondaryAction: "修改"
};

export const initialMessages: ChatMessage[] = [];

export const walletActions: WalletAction[] = [
  { id: "deposit", label: "充值", icon: "↓" },
  { id: "withdraw", label: "提现", icon: "↑" },
  { id: "transfer", label: "转账", icon: "↔" }
];

export const walletAssets: WalletAsset[] = [
  {
    id: "asset_usdt",
    symbol: "USDT",
    name: "Tether USD",
    icon: "₮",
    chain: "Multi-chain",
    balance: "8,500.00",
    valueUsd: "$8,500.00",
    change24h: "+2.1%"
  },
  {
    id: "asset_eth",
    symbol: "ETH",
    name: "Ethereum",
    icon: "◆",
    chain: "Ethereum",
    balance: "1.20 ETH",
    valueUsd: "$3,842.00",
    change24h: "-0.5%"
  },
  {
    id: "asset_btc",
    symbol: "BTC",
    name: "Bitcoin",
    icon: "₿",
    chain: "Bitcoin",
    balance: "0.015 BTC",
    valueUsd: "$1,020.00",
    change24h: "+1.8%"
  }
];

export const walletShortcuts: WalletShortcut[] = [
  { id: "cards", title: "卡库", description: "12 笔交易记录 · 本月盈利 +18.5%" },
  { id: "staking", title: "质押", description: "APY 12.5% · 已质押 500 HWT" },
  { id: "earn", title: "链上赚币", description: "DeFi 理财 · 稳定收益" }
];

export const communityMessages: CommunityMessage[] = [
  {
    id: "cm_ai_1",
    author: "AI 管家",
    avatar: "🤖",
    role: "ai",
    text: "🔥 X 热点:BTC 突破 68000 美元,市场情绪高涨",
    align: "left"
  },
  {
    id: "cm_ai_market",
    author: "AI 管家",
    avatar: "🤖",
    role: "ai",
    market: {
      pair: "BTC/USDT",
      icon: "₿",
      price: "$68,450.20",
      change24h: "+3.45% (24h)",
      trend: "up",
      spark: [62, 64, 63, 66, 65, 68, 67, 70, 69, 72, 71, 74, 73, 76, 78]
    },
    align: "left"
  },
  {
    id: "cm_user_1",
    author: "小明",
    avatar: "👨🏻‍💻",
    role: "member",
    text: "这波拉升太猛了!",
    align: "left"
  },
  {
    id: "cm_user_2",
    author: "王哥",
    avatar: "🧑🏻‍💼",
    role: "member",
    card: {
      pair: "BTC/USDT",
      direction: "做多",
      pnl: "+32.5%",
      tag: "利润"
    },
    align: "left"
  },
  {
    id: "cm_me_1",
    author: "我",
    avatar: "T",
    role: "member",
    text: "大佬带带我🙏",
    align: "right"
  },
  {
    id: "cm_ai_2",
    author: "AI 管家",
    avatar: "🤖",
    role: "ai",
    text: "提醒大家注意风控，合理设置止损。",
    align: "left"
  }
];

export const profileMenuItems: ProfileMenuItem[] = [
  { id: "notification", label: "通知管理", icon: "🔔", hasDot: true },
  { id: "security", label: "安全设置", icon: "🔒" },
  { id: "language", label: "语言设置", icon: "🌐" },
  { id: "help", label: "帮助与反馈", icon: "?" },
  { id: "about", label: "关于 H Wallet", icon: "i" }
];
