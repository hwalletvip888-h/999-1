/**
 * Card API — 卡片生成工厂
 * 封装所有卡片类型的生成函数，方便后续调用
 * 所有卡片中文展示，币种保持英文
 */
import { api } from '../../api/gateway';
import type { HWalletCard } from '../../types/card';
import { makeId } from '../../utils/id';

const now = () => new Date().toISOString();

// ─── 1. PriceCard 行情价格卡片 ─────────────────────────────────
export async function buildPriceCard(symbol: string, userPrompt?: string): Promise<HWalletCard> {
  const instId = `${symbol}-USDT`;
  const swapId = `${symbol}-USDT-SWAP`;

  const [ticker, candles, fundingRate] = await Promise.all([
    api.market.getTicker(instId),
    api.market.getCandles(instId, '1H', 24).catch(() => []),
    api.market.getFundingRate(swapId).catch(() => null),
  ]);

  const sparkData = candles.map((c: any) => typeof c === "number" ? c : c.close ?? c.c ?? 0);

  return {
    id: makeId('card_price'),
    productLine: 'v5',
    module: 'market',
    cardType: 'info',
    header: '信息卡片',
    title: `${symbol}/USDT 实时行情`,
    symbol,
    pair: `${symbol}/USDT`,
    riskLevel: '低',
    status: 'executed',
    simulationMode: false,
    userPrompt: userPrompt || `${symbol}价格`,
    aiSummary: `${symbol} 当前价格 $${ticker.last.toLocaleString()}，24h ${ticker.changePercent24h >= 0 ? '上涨' : '下跌'} ${Math.abs(ticker.changePercent24h).toFixed(2)}%`,
    createdAt: now(),
    priceData: {
      price: ticker.last,
      change24h: ticker.change24h,
      changePercent24h: ticker.changePercent24h,
      high24h: ticker.high24h,
      low24h: ticker.low24h,
      vol24h: ticker.vol24h,
      fundingRate: fundingRate?.fundingRate ?? undefined,
      sparkData,
    },
    primaryAction: '做多',
    secondaryAction: '做空',
  };
}

// ─── 2. PerpetualCard 永续合约卡片 ─────────────────────────────
export async function buildPerpetualCard(
  symbol: string,
  amount: number,
  direction: '做多' | '做空',
  leverage: number,
  userPrompt: string
): Promise<HWalletCard> {
  const instId = `${symbol}-USDT-SWAP`;
  const ticker = await api.market.getTicker(instId);

  return {
    id: makeId('card_perp'),
    productLine: 'v5',
    module: 'perpetual',
    cardType: 'trade',
    header: '交易卡片',
    title: `${symbol}/USDT 永续合约`,
    riskLevel: leverage > 10 ? '高' : leverage > 5 ? '中' : '低',
    status: 'preview',
    simulationMode: false,
    userPrompt,
    aiSummary: `${symbol}/USDT 永续合约，${amount} USDT ${direction}，${leverage}倍杠杆。当前价格 $${ticker.last.toLocaleString()}`,
    createdAt: now(),
    pair: `${symbol}/USDT`,
    amount,
    currency: 'USDT',
    direction,
    leverage,
    entryPrice: ticker.last,
    lastPrice: ticker.last,
  };
}

// ─── 3. SwapCard 兑换卡片 ──────────────────────────────────────
export async function buildSwapCard(
  fromAmount: number,
  toSymbol: string,
  userPrompt: string
): Promise<HWalletCard> {
  const instId = `${toSymbol}-USDT`;
  const ticker = await api.market.getTicker(instId);
  const estimatedAmount = fromAmount / ticker.last;

  return {
    id: makeId('card_swap'),
    productLine: 'v6',
    module: 'swap',
    cardType: 'trade',
    header: '交易卡片',
    title: `${toSymbol} 链上兑换`,
    riskLevel: '低',
    status: 'preview',
    simulationMode: false,
    userPrompt,
    aiSummary: `链上兑换 ${fromAmount} USDT → ${estimatedAmount.toFixed(6)} ${toSymbol}，参考价格 $${ticker.last.toLocaleString()}`,
    createdAt: now(),
    fromAmount,
    fromSymbol: 'USDT',
    toAmount: estimatedAmount,
    toSymbol,
    rate: `1 ${toSymbol} ≈ $${ticker.last.toLocaleString()}`,
    slippage: '0.5%',
    networkFee: '~$0.50',
    warning: '链上兑换受滑点影响，实际到账数量可能略有差异。',
    primaryAction: '确认兑换',
    secondaryAction: '换一个',
  };
}

// ─── 4. GridCard 网格策略卡片 ──────────────────────────────────
export async function buildGridCard(
  symbol: string,
  amount: number,
  userPrompt: string
): Promise<HWalletCard> {
  const instId = `${symbol}-USDT`;
  const ticker = await api.market.getTicker(instId);
  const priceLower = ticker.last * 0.92;
  const priceUpper = ticker.last * 1.08;
  const gridNum = 20;

  return {
    id: makeId('card_grid'),
    productLine: 'v5',
    module: 'grid',
    cardType: 'strategy',
    header: '策略卡片',
    title: `${symbol}/USDT 网格策略`,
    riskLevel: '中',
    status: 'preview',
    simulationMode: false,
    userPrompt,
    aiSummary: `${symbol}/USDT 网格策略，投入 ${amount} USDT，价格区间 $${priceLower.toFixed(0)}~$${priceUpper.toFixed(0)}，${gridNum} 格。AI 推荐参数。`,
    createdAt: now(),
    pair: `${symbol}/USDT`,
    amount,
    currency: 'USDT',
    agentName: `网格 · ${symbol}/USDT`,
    agentTags: ['网格', `${symbol}/USDT`, '中风险'],
    rows: [
      { label: '价格上限', value: `$${priceUpper.toFixed(0)}` },
      { label: '价格下限', value: `$${priceLower.toFixed(0)}` },
      { label: '网格数', value: `${gridNum}` },
      { label: '当前价格', value: `$${ticker.last.toLocaleString()}` },
    ],
    warning: '网格策略在单边行情中可能产生浮亏，请确认风险承受能力。',
    primaryAction: '启动网格',
    secondaryAction: '调整参数',
  };
}

// ─── 5. EarnCard 质押赚币卡片 ──────────────────────────────────
export function buildEarnCard(
  amount: number,
  isEth: boolean,
  userPrompt: string
): HWalletCard {
  const protocol = isEth ? 'Lido' : 'Aave';
  const apy = isEth ? '3.80' : '5.20';
  const reward = isEth ? 'stETH' : 'aUSDT';

  return {
    id: makeId('card_earn'),
    productLine: 'v6',
    module: 'earn',
    cardType: 'trade',
    header: '交易卡片',
    title: `${protocol} 质押`,
    subtitle: '链上锁仓 · 持续生息',
    riskLevel: '低',
    status: 'preview',
    simulationMode: false,
    userPrompt,
    aiSummary: `${protocol} 质押 ${amount} ${isEth ? 'ETH' : 'USDT'}，预估年化 ${apy}%`,
    createdAt: now(),
    stakeProtocol: protocol,
    stakeChain: isEth ? 'Ethereum' : 'Polygon',
    stakeApy: apy,
    stakeAmount: `${amount} ${isEth ? 'ETH' : 'USDT'}`,
    stakeLockPeriod: '灵活',
    stakeRewardSymbol: reward,
    stakeEstReward: `≈ ${(amount * parseFloat(apy) / 100).toFixed(2)} ${reward} / 年`,
    stakeRiskLevel: 'low',
    rows: [],
    warning: '质押存在智能合约与脱锚风险，APY 会随市场波动。',
    primaryAction: '确认质押',
    secondaryAction: '换一个',
  };
}

// ─── 6. PositionCard 持仓卡片 ──────────────────────────────────
export async function buildPositionCard(userPrompt: string): Promise<HWalletCard> {
  const positions = await api.perpetual.getPositions();

  return {
    id: makeId('card_position'),
    productLine: 'v5',
    module: 'account',
    cardType: 'info',
    header: '信息卡片',
    title: '当前持仓',
    riskLevel: '低',
    status: 'executed',
    simulationMode: false,
    userPrompt,
    aiSummary: positions.length > 0
      ? `当前共 ${positions.length} 个持仓`
      : '当前没有持仓',
    createdAt: now(),
    positions: positions.map(p => ({
      instId: p.instId,
      side: p.side,
      size: p.size,
      avgPrice: p.avgPrice,
      markPrice: p.markPrice,
      unrealizedPnl: p.unrealizedPnl,
      unrealizedPnlPercent: p.unrealizedPnlPercent,
      leverage: p.leverage,
      liquidationPrice: p.liquidationPrice,
      margin: p.margin,
    })),
  };
}

// ─── 7. AddressCard 充值地址卡片 ──────────────────────────────
export function buildAddressCard(
  addresses: { evm: any[]; solana: any[] },
  userPrompt: string,
): HWalletCard {
  const evmAddr: string = addresses.evm?.[0]?.address ?? "";
  const solAddr: string = addresses.solana?.[0]?.address ?? "";

  const depositAddresses = [];
  if (evmAddr) {
    depositAddresses.push({ chain: "evm", label: "EVM 通用（ETH / BNB / Base / OKX）", address: evmAddr });
  }
  if (solAddr) {
    depositAddresses.push({ chain: "solana", label: "Solana", address: solAddr });
  }

  return {
    id: makeId("card_address"),
    productLine: "v6",
    module: "wallet",
    cardType: "info",
    header: "信息卡片",
    title: "📥 充值地址",
    riskLevel: "低",
    status: "executed",
    simulationMode: false,
    userPrompt,
    aiSummary: `EVM: ${evmAddr ? evmAddr.slice(0, 8) + "..." : "无"}  SOL: ${solAddr ? solAddr.slice(0, 8) + "..." : "无"}`,
    createdAt: now(),
    depositAddresses,
    warning: "转账前请确认链别，转错链无法找回",
  };
}

// ─── 8. TransferCard 转账卡片 ──────────────────────────────────
export function buildTransferCard(params: {
  toAddress: string;
  chain: string;
  symbol: string;
  amount: number;
  isKnownAddress: boolean;
  estimatedFee?: string;
  userPrompt: string;
}): HWalletCard {
  const { toAddress, chain, symbol, amount, isKnownAddress, estimatedFee, userPrompt } = params;
  const addrShort = toAddress.length > 12
    ? `${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`
    : toAddress;
  const chainLabel = chain === "evm" ? "EVM" : "Solana";
  return {
    id: makeId("card_transfer"),
    productLine: "v6",
    module: "wallet",
    cardType: "wallet_action",
    header: "钱包操作卡",
    title: `📤 转出 ${amount} ${symbol}`,
    riskLevel: isKnownAddress ? "低" : "高",
    status: "pending",
    simulationMode: false,
    userPrompt,
    aiSummary: `${chainLabel} · 向 ${addrShort} 转出 ${amount} ${symbol}`,
    createdAt: now(),
    toAddress,
    transferChain: chain,
    symbol,
    amount,
    estimatedFee: estimatedFee ?? "~",
    isKnownAddress,
    warning: isKnownAddress
      ? undefined
      : "⚠️ 该地址在本次对话中从未出现过，请仔细核对，转错无法找回！",
  };
}

// ─── 8b. TransferSelectCard 地址选择卡片（无地址时弹出）──────────
export function buildTransferSelectCard(params: {
  recentAddresses: string[];
  amount?: number;
  symbol?: string;
  userPrompt: string;
}): HWalletCard {
  return {
    id: makeId("card_transfer_select"),
    productLine: "v6",
    module: "wallet",
    cardType: "wallet_action",
    header: "钱包操作卡",
    title: "📤 选择转账地址",
    riskLevel: "低",
    status: "pending",
    simulationMode: false,
    userPrompt: params.userPrompt,
    aiSummary: "请选择近期地址或粘贴新地址",
    createdAt: now(),
    recentAddresses: params.recentAddresses,
    transferSelectMode: true,
    amount: params.amount ?? 0,
    symbol: params.symbol ?? "USDT",
  };
}

// ─── 9. PortfolioCard 资产总览卡片 ─────────────────────────────
export async function buildPortfolioCard(userPrompt: string): Promise<HWalletCard> {
  const overview = await api.account.getOverview();

  return {
    id: makeId('card_portfolio'),
    productLine: 'v5',
    module: 'account',
    cardType: 'info',
    header: '信息卡片',
    title: '链上钱包资产',
    riskLevel: '低',
    status: 'executed',
    simulationMode: false,
    userPrompt,
    aiSummary: `总资产 $${overview.totalEquity.toLocaleString()}`,
    createdAt: now(),
    totalEquity: overview.totalEquity,
    balances: overview.balances.map(b => ({
      currency: b.currency,
      available: b.available,
      total: b.total,
      usdtValue: b.usdtValue,
    })),
  };
}

// ─── 9. TradeResultCard 交易结果卡片 ───────────────────────────
export function buildTradeResultCard(
  success: boolean,
  symbol: string,
  direction: string,
  amount: number,
  price: number,
  orderId?: string,
  errorMsg?: string
): HWalletCard {
  return {
    id: makeId('card_result'),
    productLine: 'v5',
    module: 'perpetual',
    cardType: 'info',
    header: '信息卡片',
    title: success ? '交易成功' : '交易失败',
    symbol,
    riskLevel: '低',
    status: success ? 'executed' : 'failed',
    simulationMode: false,
    userPrompt: '',
    aiSummary: success
      ? `${symbol} ${direction}交易已成交，金额 ${amount} USDT，价格 $${price.toLocaleString()}${orderId ? `，订单号 ${orderId}` : ''}`
      : `交易失败：${errorMsg || '未知错误'}`,
    createdAt: now(),
    icon: success ? '✅' : '❌',
    subtitle: success ? '订单已提交至交易所' : errorMsg || '请稍后重试',
    rows: success ? [
      { label: '币种', value: `${symbol}/USDT` },
      { label: '方向', value: direction, accent: direction === '做多' ? 'positive' as const : 'negative' as const },
      { label: '金额', value: `${amount} USDT` },
      { label: '成交价', value: `$${price.toLocaleString()}` },
      ...(orderId ? [{ label: '订单号', value: orderId }] : []),
    ] : [
      { label: '错误', value: errorMsg || '未知错误', accent: 'negative' as const },
    ],
  };
}
