/**
 * 共享：将 trend_engine 产出的 JSON 规范为 TrendReport（RN 与 wallet-backend 共用）
 */
export interface TrendReport {
  timestamp: string;
  symbol: string;
  currentPrice: number;
  overallScore: number;
  direction: "bullish" | "bearish" | "neutral";
  directionCn: string;
  confidence: string;
  priceRange: {
    support: number;
    resistance: number;
    prediction24h: { upper: number; center: number; lower: number };
    prediction7d: { upper: number; center: number; lower: number };
  };
  probability: { up: number; flat: number; down: number };
  momentum: {
    changes: { "4h": number; "12h": number; "24h": number; "3d": number; "7d": number };
    score: number;
    acceleration: string;
  };
  breakdown: {
    technical: number;
    microstructure: number;
    smartmoney: number;
    momentum: number;
  };
  alerts: unknown[];
  recommendation: string;
}

export function parseTrendOutput(data: Record<string, unknown>): TrendReport {
  const trend = (data.trend as Record<string, unknown>) || {};
  const score = (trend.total_score as number) ?? 0;
  const direction = score > 20 ? "bullish" : score < -20 ? "bearish" : "neutral";
  const priceRange = (data.price_range as Record<string, unknown>) || {};
  const pred24h = (priceRange.prediction_24h as Record<string, unknown>) || {};
  const pred7d = (priceRange.prediction_7d as Record<string, unknown>) || {};
  const momentum = (data.momentum as Record<string, unknown>) || {};
  const prob = (data.probability as Record<string, unknown>) || {};
  const breakdown = (trend.breakdown as Record<string, unknown>) || {};

  return {
    timestamp: (data.timestamp as string) || new Date().toISOString(),
    symbol: (data.coin as string) || "BTC",
    currentPrice: (data.current_price as number) || 0,
    overallScore: score,
    direction,
    directionCn:
      (trend.direction as string) ||
      (direction === "bullish" ? "看多" : direction === "bearish" ? "看空" : "震荡"),
    confidence: (trend.confidence as string) || "low",
    priceRange: {
      support: (priceRange.nearest_support as number) || 0,
      resistance: (priceRange.nearest_resistance as number) || 0,
      prediction24h: {
        upper: (pred24h.upper as number) || 0,
        center: (pred24h.center as number) || 0,
        lower: (pred24h.lower as number) || 0,
      },
      prediction7d: {
        upper: (pred7d.upper as number) || 0,
        center: (pred7d.center as number) || 0,
        lower: (pred7d.lower as number) || 0,
      },
    },
    probability: {
      up: (prob.up as number) || 0,
      flat: (prob.flat as number) || 0,
      down: (prob.down as number) || 0,
    },
    momentum: {
      changes: (momentum.changes as TrendReport["momentum"]["changes"]) || {
        "4h": 0,
        "12h": 0,
        "24h": 0,
        "3d": 0,
        "7d": 0,
      },
      score: (momentum.score as number) || 0,
      acceleration: (momentum.acceleration as string) || "unknown",
    },
    breakdown: {
      technical: (breakdown.technical as number) || 0,
      microstructure: (breakdown.microstructure as number) || 0,
      smartmoney: (breakdown.smartmoney as number) || 0,
      momentum: (breakdown.momentum as number) || 0,
    },
    alerts: (data.alerts as unknown[]) || [],
    recommendation: "",
  };
}
