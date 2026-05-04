import { makeId } from "../utils/id";
import { nowLabel } from "../utils/format";
import { generateCandles } from "../components/Candlestick";
import type { CardStatus, ChatMessage, TradeCard, HWalletCard } from "../types";

// ─────────────────────────────────────────────────────────────
// Card builders
// ─────────────────────────────────────────────────────────────

function makePerpetualCard(input: string, status: CardStatus = "preview"): HWalletCard {
  const lower = input.toLowerCase();
  const isBtc = lower.includes("btc") || input.includes("比特币");
  const wantsShort = input.includes("做空") || lower.includes("short");
  const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(u|usdt|美元)?/i);
  const amount = amountMatch?.[1] ?? "100";
  const symbol = isBtc ? "BTC/USDT" : "ETH/USDT";
  const pair = isBtc ? "BTCUSDT" : "ETHUSDT";

  const basePrice = isBtc ? 78354.8 : 3842.5;
  const drift = wantsShort ? -0.011 : 0.0085;
  const lastPrice = +(basePrice * (1 + drift)).toFixed(isBtc ? 1 : 2);
  const leverageNum = 50;
  const rawPct = ((lastPrice - basePrice) / basePrice) * (wantsShort ? -1 : 1);
  const pnlPercent = +(rawPct * leverageNum * 100).toFixed(2);

  const cardId = makeId("card_perp");
  const candles = generateCandles({
    seed: cardId + pair,
    count: 48,
    start: basePrice * (wantsShort ? 1.012 : 0.992),
    end: lastPrice,
    volatility: 0.0035
  });

  return {
    id: cardId,
    category: "perpetual",
    productLine: "v5",
    module: "perpetual",
    cardType: "trade",
    header: "交易卡片",
    riskLevel: "中",
    status,
    simulationMode: true,
    userPrompt: input,
    aiSummary: "AI 已为你生成交易卡片，请确认后再模拟执行。",
    createdAt: new Date().toISOString(),
    title: `${symbol} 永续合约`,
    symbol,
    pair,
    leverage: leverageNum,
    direction: wantsShort ? "做空" : "做多",
    pnlPercent,
    candles,
    rows: [
      { label: "方向", value: wantsShort ? "做空" : "做多", accent: wantsShort ? "negative" : "positive" },
      { label: "金额", value: `${amount} USDT` },
      { label: "杠杆", value: `${leverageNum}x`, accent: "warning" },
      { label: "预估开仓价", value: `$${basePrice.toLocaleString()}` },
      { label: "止损建议", value: wantsShort ? "+3.5%" : "-3.5%", accent: "warning" }
    ],
    warning: "这是 Mock 卡片，不会真实下单。",
    primaryAction: "确认交易",
    secondaryAction: "修改"
  };
// 移除多余的 '}'
}

function makeSwapCard(input: string, status: CardStatus = "preview"): TradeCard {
  const lower = input.toLowerCase();
  const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(u|usdt|美元)?/i);
  const amount = amountMatch?.[1] ?? "100";
  const wantsBtc = lower.includes("btc") || input.includes("比特币");
  // default: USDT → ETH or USDT → BTC
  const fromSymbol = "USDT";
  const toSymbol = wantsBtc ? "BTC" : "ETH";
  const rate = wantsBtc ? 78_354.8 : 3_842.5;
  const fromAmount = parseFloat(amount);
  const toAmount = +(fromAmount / rate).toFixed(wantsBtc ? 6 : 4);
  const isEth = lower.includes("eth") || input.includes("以太");
  const apy = isEth ? "3.80" : "5.20";
  const protocol = isEth ? "Lido" : "Aave";
  const reward = isEth ? "stETH" : "aUSDT";
  const yearReward = isEth
    ? `≈ ${(parseFloat(amount) * 0.038).toFixed(3)} ${reward} / 年`
    : `≈ ${(parseFloat(amount) * 0.052).toFixed(2)} USDT / 年`;
  return {
    id: makeId("card_stake"),
    category: "stake",
    productLine: "v6",
    module: "earn",
    cardType: "trade",
    header: "交易卡片",
    riskLevel: "低",
    status,
    simulationMode: true,
    userPrompt: input,
    aiSummary: "AI 已为你生成质押卡片，请确认后再模拟执行。",
    createdAt: new Date().toISOString(),
    title: isEth ? "ETH 质押" : "USDT 质押",
    subtitle: "链上质押 · 稳定收益",
    symbol: isEth ? "ETH" : "USDT",
    icon: "S",
    stakeProtocol: protocol,
    stakeChain: isEth ? "Ethereum" : "Polygon",
    stakeApy: apy,
    stakeAmount: amount,
    stakeLockPeriod: "灵活",
    stakeRewardSymbol: reward,
    stakeEstReward: yearReward,
    stakeRiskLevel: "low",
    rows: [],
    warning: "质押收益非保证，注意链上风险。",
    primaryAction: "确认质押",
    secondaryAction: "修改"
  };
}

function makeAgentCard(input: string, status: CardStatus = "running"): TradeCard {
  const lower = input.toLowerCase();
  const isGrid = input.includes("网格") || lower.includes("grid");
  const isBtc = lower.includes("btc") || input.includes("比特币");

  // Mock equity curve (上升趋势 + 小波动)
  const seed = lower.length + (isGrid ? 7 : 3) + (isBtc ? 11 : 5);
  let v = 100;
  const curve: number[] = [];
  for (let i = 0; i < 32; i++) {
    const noise = Math.sin(i * 0.7 + seed) * 0.6 + Math.cos(i * 0.4) * 0.4;
    v += 0.35 + noise;
    curve.push(+v.toFixed(2));
  }

  return {
    id: makeId("card_agent"),
    category: "agent",
    title: isGrid ? "网格策略" : "趋势跟随策略",
    subtitle: "AI Agent · 自动运行",
    symbol: isBtc ? "BTC/USDT" : "ETH/USDT",
    icon: "A",
    status,
    agentName: isGrid ? "网格 · BTC/USDT" : "趋势 · ETH/USDT",
    agentTags: isGrid
      ? ["网格", "BTC/USDT", "中风险"]
      : ["趋势跟随", "ETH/USDT", "中风险"],
    agentRunDuration: "3天 12小时",
    agentTotalProfit: "+12.4 U",
    agentTodayProfit: "+2.1 U",
    // agentTrades 字段移除，HWalletCard 无此字段
      productLine: "v5",
      module: "grid",
      cardType: "strategy",
      header: "策略卡片",
      riskLevel: "中",
      simulationMode: true,
      userPrompt: input,
      aiSummary: "AI 已为你生成 Agent 卡片，请确认后再模拟执行。",
      createdAt: new Date().toISOString(),
    agentWinRate: "68%",
    agentEquityCurve: curve,
    rows: [],
    warning: "Agent 自动执行不构成投资建议。",
    primaryAction: "启动 Agent",
    secondaryAction: "调整参数"
  };
// 移除多余的 '}'

function makeStakeCard(input: string, status: CardStatus = "preview"): HWalletCard {
  const lower = input.toLowerCase();
  const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(u|usdt|美元)?/i);
  const amount = amountMatch?.[1] ?? "100";
  const isEth = lower.includes("eth") || input.includes("以太");
  const apy = isEth ? "3.80" : "5.20";
  const protocol = isEth ? "Lido" : "Aave";
  const reward = isEth ? "stETH" : "aUSDT";
  const yearReward = isEth
    ? `≈ ${(parseFloat(amount) * 0.038).toFixed(3)} ${reward} / 年`
    : `≈ ${(parseFloat(amount) * 0.052).toFixed(2)} USDT / 年`;

  return {
    id: makeId("card_stake"),
    category: "stake",
    productLine: "v6",
    module: "earn",
    cardType: "trade",
    header: "交易卡片",
    riskLevel: "低",
    status,
    simulationMode: true,
    userPrompt: input,
    aiSummary: "AI 已为你生成质押卡片，请确认后再模拟执行。",
    createdAt: new Date().toISOString(),
    title: `${protocol} 质押`,
    subtitle: "链上锁仓 · 持续生息",
    symbol: isEth ? "ETH" : "USDT",
    icon: "％",
    stakeProtocol: protocol,
    stakeChain: isEth ? "Ethereum" : "Polygon",
    stakeApy: apy,
    stakeAmount: `${parseFloat(amount).toLocaleString()} ${isEth ? "ETH" : "USDT"}`,
    stakeLockPeriod: "灵活",
    stakeRewardSymbol: reward,
    stakeEstReward: yearReward,
    stakeRiskLevel: "low",
    rows: [],
    warning: "质押存在智能合约与脱锚风险，APY 会随市场波动。",
    primaryAction: "确认质押",
    secondaryAction: "换一个"
  };
// 移除多余的 '}'

// ...文件结尾闭合...
}
}
