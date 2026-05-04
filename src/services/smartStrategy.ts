/**
 * smartStrategy.ts — 智能策略切换引擎
 *
 * 根据市场状态自动选择最优策略：
 * - 震荡市 → 网格策略（Grid）
 * - 趋势市 → DCA / 趋势跟随
 * - Meme 热潮 → Sniper 狙击
 *
 * 数据来源：
 * - OKX V5 行情信号（BTC 永续合约）
 * - Meme 市场热度指标
 * - Grid AI 推荐参数
 */
import { getTicker, getCandles } from "./okxApi";
import { getGridAiParams, getHotTokens, type GridAiParams } from "./onchainApi";

export type MarketRegime = "ranging" | "trending_up" | "trending_down" | "meme_hot";

export type StrategyRecommendation = {
  regime: MarketRegime;
  confidence: number;          // 0-100
  primaryStrategy: string;
  secondaryStrategy: string;
  reason: string;
  gridParams?: GridAiParams;
  memeHeat?: number;           // 0-100 meme 市场热度
  btcSignal?: {
    price: string;
    change24h: string;
    volatility: string;
  };
};

/**
 * 计算价格波动率（简化版 ATR）
 */
function calcVolatility(candles: { h: number; l: number; c: number }[]): number {
  if (candles.length < 5) return 0;
  let sum = 0;
  for (const c of candles) {
    const range = (c.h - c.l) / c.c;
    sum += range;
  }
  return (sum / candles.length) * 100; // 百分比
}

/**
 * 判断趋势方向（简化版：比较 MA5 vs MA20）
 */
function detectTrend(candles: { c: number }[]): { direction: "up" | "down" | "neutral"; strength: number } {
  if (candles.length < 20) return { direction: "neutral", strength: 0 };

  const closes = candles.map((c) => c.c);
  const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;

  const diff = (ma5 - ma20) / ma20 * 100;

  if (diff > 2) return { direction: "up", strength: Math.min(100, diff * 10) };
  if (diff < -2) return { direction: "down", strength: Math.min(100, Math.abs(diff) * 10) };
  return { direction: "neutral", strength: Math.abs(diff) * 10 };
}

/**
 * 评估 Meme 市场热度
 */
async function assessMemeHeat(chainIndex = "501"): Promise<number> {
  try {
    const tokens = await getHotTokens(chainIndex, { limit: 10, rankBy: "5" });
    if (!tokens || tokens.length === 0) return 0;

    // 热度指标：高交易量代币数量 + 平均涨幅
    let highVolCount = 0;
    let totalChange = 0;
    for (const t of tokens) {
      const vol = parseFloat(t.volume || "0");
      if (vol > 500_000) highVolCount++;
      totalChange += parseFloat(t.change || "0");
    }
    const avgChange = totalChange / tokens.length;
    const heat = Math.min(100, highVolCount * 15 + Math.max(0, avgChange) * 2);
    return Math.round(heat);
  } catch {
    return 0;
  }
}

/**
 * 主函数：评估市场状态并推荐策略
 */
export async function assessMarketAndRecommend(): Promise<StrategyRecommendation> {
  // 1. 获取 BTC 永续合约行情
  let btcPrice = "0";
  let btcChange = "0";
  let volatility = 0;
  let trend: { direction: "up" | "down" | "neutral"; strength: number } = { direction: "neutral", strength: 0 };

  try {
    const ticker = await getTicker("BTC-USDT-SWAP");
    btcPrice = ticker?.last || "0";
    if (ticker?.last && ticker?.open24h) {
      const pct = ((parseFloat(ticker.last) - parseFloat(ticker.open24h)) / parseFloat(ticker.open24h) * 100).toFixed(2);
      btcChange = pct;
    }
  } catch { /* ignore */ }

  try {
    const candles = await getCandles("BTC-USDT-SWAP", "4H", 30);
    if (candles && candles.length > 0) {
      volatility = calcVolatility(candles);
      trend = detectTrend(candles);
    }
  } catch { /* ignore */ }

  // 2. 评估 Meme 热度
  const memeHeat = await assessMemeHeat();

  // 3. 获取 Grid AI 参数
  let gridParams: GridAiParams | null = null;
  try {
    gridParams = await getGridAiParams("BTC-USDT-SWAP", "neutral");
  } catch { /* ignore */ }

  // 4. 判断市场状态
  let regime: MarketRegime;
  let confidence: number;
  let primaryStrategy: string;
  let secondaryStrategy: string;
  let reason: string;

  if (memeHeat > 70) {
    // Meme 市场极度活跃
    regime = "meme_hot";
    confidence = memeHeat;
    primaryStrategy = "meme_sniper";
    secondaryStrategy = "grid";
    reason = `Meme 市场热度 ${memeHeat}/100，多个代币交易量激增，建议狙击短期机会`;
  } else if (trend.direction === "up" && trend.strength > 40) {
    regime = "trending_up";
    confidence = Math.round(trend.strength);
    primaryStrategy = "dca_long";
    secondaryStrategy = "grid_long";
    reason = `BTC 处于上升趋势（MA5 > MA20），建议做多 DCA 或多头网格`;
  } else if (trend.direction === "down" && trend.strength > 40) {
    regime = "trending_down";
    confidence = Math.round(trend.strength);
    primaryStrategy = "dca_short";
    secondaryStrategy = "grid_short";
    reason = `BTC 处于下降趋势，建议减仓或空头网格`;
  } else {
    // 震荡市
    regime = "ranging";
    confidence = Math.round(100 - trend.strength);
    primaryStrategy = "grid_neutral";
    secondaryStrategy = "meme_sniper";
    reason = volatility > 3
      ? `BTC 高波动震荡（ATR ${volatility.toFixed(1)}%），网格策略最优`
      : `BTC 低波动盘整，中性网格 + Meme 辅助`;
  }

  return {
    regime,
    confidence,
    primaryStrategy,
    secondaryStrategy,
    reason,
    gridParams: gridParams || undefined,
    memeHeat,
    btcSignal: {
      price: btcPrice,
      change24h: btcChange,
      volatility: volatility.toFixed(2) + "%",
    },
  };
}

/**
 * 快速获取策略建议文本（用于 AI 对话）
 */
export async function getQuickAdvice(): Promise<string> {
  const rec = await assessMarketAndRecommend();
  let text = `📊 市场状态: ${regimeLabel(rec.regime)} (置信度 ${rec.confidence}%)\n`;
  text += `💡 推荐策略: ${strategyLabel(rec.primaryStrategy)}\n`;
  text += `📝 理由: ${rec.reason}\n`;

  if (rec.btcSignal) {
    text += `\n🔸 BTC: $${parseFloat(rec.btcSignal.price).toLocaleString()} (${rec.btcSignal.change24h}%) 波动率 ${rec.btcSignal.volatility}`;
  }
  if (rec.memeHeat && rec.memeHeat > 30) {
    text += `\n🔥 Meme 热度: ${rec.memeHeat}/100`;
  }
  if (rec.gridParams) {
    text += `\n📐 Grid AI: ${rec.gridParams.minPx} - ${rec.gridParams.maxPx}, ${rec.gridParams.gridNum} 格, 年化 ${rec.gridParams.annualizedRate}`;
  }

  return text;
}

function regimeLabel(r: MarketRegime): string {
  switch (r) {
    case "ranging": return "震荡盘整";
    case "trending_up": return "上升趋势";
    case "trending_down": return "下降趋势";
    case "meme_hot": return "Meme 热潮";
  }
}

function strategyLabel(s: string): string {
  switch (s) {
    case "grid_neutral": return "中性网格";
    case "grid_long": return "多头网格";
    case "grid_short": return "空头网格";
    case "dca_long": return "做多定投";
    case "dca_short": return "减仓/做空";
    case "meme_sniper": return "Meme 狙击";
    default: return s;
  }
}
