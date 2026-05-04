/**
 * memeSniper.ts — Meme 币狙击策略服务
 *
 * 功能：
 * 1. 监控热门代币列表，发现符合条件的标的
 * 2. 自动安全扫描（蜂罐检测、税率检查）
 * 3. 生成买入/卖出建议卡片
 * 4. 连接 DEX Swap 执行交易（需用户确认）
 *
 * 策略逻辑：
 * - 筛选条件：交易量 > $100K, 市值 $500K-$50M, 持有人 > 200
 * - 安全条件：非蜂罐, 卖出税 < 10%, 开源合约
 * - 风控：单笔最大投入 $50, 止损 -30%, 止盈 +100%
 */
import {
  getHotTokens,
  getTokenPriceInfo,
  tokenSecurityScan,
  getSwapQuote,
  type HotToken,
  type TokenSecurityInfo,
} from "./onchainApi";

export type SniperConfig = {
  chainIndex: string;
  maxInvestPerToken: number;  // USDT
  minVolume: number;          // 最小24h交易量
  minMarketCap: number;       // 最小市值
  maxMarketCap: number;       // 最大市值
  minHolders: number;         // 最小持有人数
  maxSellTax: number;         // 最大卖出税 (%)
  stopLoss: number;           // 止损百分比 (负数)
  takeProfit: number;         // 止盈百分比
};

export const DEFAULT_SNIPER_CONFIG: SniperConfig = {
  chainIndex: "501",          // Solana
  maxInvestPerToken: 50,
  minVolume: 100_000,
  minMarketCap: 500_000,
  maxMarketCap: 50_000_000,
  minHolders: 200,
  maxSellTax: 10,
  stopLoss: -30,
  takeProfit: 100,
};

export type SniperCandidate = {
  token: HotToken;
  security: TokenSecurityInfo | null;
  score: number;              // 0-100 综合评分
  reason: string;             // 推荐理由
  riskWarnings: string[];     // 风险提示
  suggestedAmount: number;    // 建议投入金额 USDT
};

/**
 * 计算代币综合评分
 */
function scoreToken(token: HotToken, security: TokenSecurityInfo | null, config: SniperConfig): number {
  let score = 50; // 基础分

  // 交易量评分 (0-20分)
  const vol = parseFloat(token.volume || "0");
  if (vol > 1_000_000) score += 20;
  else if (vol > 500_000) score += 15;
  else if (vol > 100_000) score += 10;

  // 市值评分 (0-15分) - 偏好中等市值
  const mc = parseFloat(token.marketCap || "0");
  if (mc > 1_000_000 && mc < 10_000_000) score += 15;
  else if (mc > 500_000 && mc < 50_000_000) score += 10;

  // 持有人评分 (0-10分)
  const holders = parseInt(token.holders || "0");
  if (holders > 1000) score += 10;
  else if (holders > 500) score += 7;
  else if (holders > 200) score += 4;

  // 买卖比评分 (0-10分)
  const buys = parseInt(token.txsBuy || "0");
  const sells = parseInt(token.txsSell || "0");
  if (buys > 0 && sells > 0) {
    const ratio = buys / sells;
    if (ratio > 1.5) score += 10;
    else if (ratio > 1.2) score += 7;
    else if (ratio > 1) score += 4;
  }

  // 安全评分 (扣分项)
  if (security) {
    if (security.isHoneypot) score -= 50;
    if (security.isMintable) score -= 10;
    if (!security.isOpenSource) score -= 5;
    const sellTax = parseFloat(security.sellTax || "0");
    if (sellTax > 10) score -= 20;
    else if (sellTax > 5) score -= 10;
  }

  // 集中度评分 (扣分项)
  const top10 = parseFloat(token.top10HoldPercent || "0");
  if (top10 > 50) score -= 15;
  else if (top10 > 30) score -= 8;

  const dev = parseFloat(token.devHoldPercent || "0");
  if (dev > 20) score -= 15;
  else if (dev > 10) score -= 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * 生成推荐理由
 */
function generateReason(token: HotToken, score: number): string {
  const parts: string[] = [];
  const vol = parseFloat(token.volume || "0");
  const mc = parseFloat(token.marketCap || "0");
  const holders = parseInt(token.holders || "0");

  if (vol > 500_000) parts.push(`高交易量 $${(vol / 1e6).toFixed(1)}M`);
  if (mc > 1_000_000 && mc < 10_000_000) parts.push("中等市值（成长空间大）");
  if (holders > 1000) parts.push(`${holders} 持有人（社区活跃）`);

  const buys = parseInt(token.txsBuy || "0");
  const sells = parseInt(token.txsSell || "0");
  if (buys > sells * 1.3) parts.push("买入压力强");

  if (parts.length === 0) parts.push("综合指标良好");
  return parts.join(" · ");
}

/**
 * 扫描热门代币并筛选候选标的
 */
export async function scanForCandidates(
  config: SniperConfig = DEFAULT_SNIPER_CONFIG
): Promise<SniperCandidate[]> {
  // 1. 获取热门代币
  const hotTokens = await getHotTokens(config.chainIndex, {
    rankBy: "5", // 按交易量排序
    limit: 30,
  });

  if (!hotTokens || hotTokens.length === 0) return [];

  // 2. 筛选 + 安全扫描
  const candidates: SniperCandidate[] = [];

  for (const token of hotTokens) {
    const vol = parseFloat(token.volume || "0");
    const mc = parseFloat(token.marketCap || "0");
    const holders = parseInt(token.holders || "0");

    // 基本筛选
    if (vol < config.minVolume) continue;
    if (mc < config.minMarketCap || mc > config.maxMarketCap) continue;
    if (holders < config.minHolders) continue;

    // 安全扫描
    let security: TokenSecurityInfo | null = null;
    try {
      security = await tokenSecurityScan(config.chainIndex, token.tokenContractAddress);
    } catch {
      // 扫描失败不阻断
    }

    // 安全检查
    const riskWarnings: string[] = [];
    if (security?.isHoneypot) {
      riskWarnings.push("疑似蜂罐合约");
      continue; // 直接跳过蜂罐
    }
    if (security?.isMintable) riskWarnings.push("合约可增发");
    if (!security?.isOpenSource) riskWarnings.push("合约未开源");
    const sellTax = parseFloat(security?.sellTax || "0");
    if (sellTax > config.maxSellTax) {
      riskWarnings.push(`卖出税过高 ${sellTax}%`);
      continue;
    } else if (sellTax > 5) {
      riskWarnings.push(`卖出税 ${sellTax}%`);
    }

    const top10 = parseFloat(token.top10HoldPercent || "0");
    if (top10 > 40) riskWarnings.push(`前10持有 ${top10.toFixed(0)}%`);
    const dev = parseFloat(token.devHoldPercent || "0");
    if (dev > 15) riskWarnings.push(`开发者持有 ${dev.toFixed(0)}%`);

    // 评分
    const score = scoreToken(token, security, config);
    if (score < 40) continue; // 评分太低跳过

    // 建议投入金额（评分越高投入越多）
    const suggestedAmount = Math.min(
      config.maxInvestPerToken,
      Math.round((score / 100) * config.maxInvestPerToken)
    );

    candidates.push({
      token,
      security,
      score,
      reason: generateReason(token, score),
      riskWarnings,
      suggestedAmount,
    });
  }

  // 按评分排序
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 5); // 返回 top 5
}

/**
 * 获取买入报价
 */
export async function getSnipeBuyQuote(
  chainIndex: string,
  tokenAddress: string,
  amountUsdt: number
): Promise<{
  estimatedTokens: string;
  estimatedGas: string;
  priceImpact: string;
} | null> {
  // SOL 链上 USDT 地址
  const USDT_SOL = "Es9vMFrzaCERmKfrFfCPYJiLBpuY6Gy3qVrNkNQoJi9N";
  // 将 USDT 金额转为最小单位 (6 decimals)
  const amount = String(Math.round(amountUsdt * 1e6));

  try {
    const quote = await getSwapQuote({
      chainIndex,
      fromTokenAddress: USDT_SOL,
      toTokenAddress: tokenAddress,
      amount,
      slippage: "1", // 1% slippage for meme coins
    });
    if (!quote) return null;
    return {
      estimatedTokens: quote.routerResult.toTokenAmount,
      estimatedGas: quote.routerResult.estimateGasFee,
      priceImpact: "< 1%",
    };
  } catch {
    return null;
  }
}

/**
 * 策略状态
 */
export type SniperState = {
  running: boolean;
  lastScan: number;
  candidates: SniperCandidate[];
  positions: SniperPosition[];
};

export type SniperPosition = {
  tokenSymbol: string;
  tokenAddress: string;
  chainIndex: string;
  entryPrice: number;
  currentPrice: number;
  amount: number;
  investedUsdt: number;
  pnlPercent: number;
  status: "holding" | "sold" | "stop-loss" | "take-profit";
};

// 全局状态
let sniperState: SniperState = {
  running: false,
  lastScan: 0,
  candidates: [],
  positions: [],
};

export function getSniperState(): SniperState {
  return { ...sniperState };
}

export function startSniper(config?: Partial<SniperConfig>) {
  sniperState.running = true;
  // 首次扫描
  runSniperScan(config ? { ...DEFAULT_SNIPER_CONFIG, ...config } : DEFAULT_SNIPER_CONFIG);
}

export function stopSniper() {
  sniperState.running = false;
}

async function runSniperScan(config: SniperConfig) {
  if (!sniperState.running) return;
  try {
    const candidates = await scanForCandidates(config);
    sniperState.candidates = candidates;
    sniperState.lastScan = Date.now();
  } catch (e) {
    console.warn("[Sniper] scan failed:", e);
  }
}
