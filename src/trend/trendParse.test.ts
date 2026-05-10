import { describe, expect, it } from "vitest";
import { parseTrendOutput } from "./trendParse";

describe("parseTrendOutput", () => {
  it("maps minimal BTC trend blob", () => {
    const r = parseTrendOutput({
      timestamp: "2026-01-01T00:00:00Z",
      coin: "BTC",
      current_price: 99_000,
      trend: {
        total_score: 25,
        direction: "偏多",
        confidence: "high",
        breakdown: { technical: 1, microstructure: 2, smartmoney: 3, momentum: 4 },
      },
      price_range: {
        nearest_support: 90_000,
        nearest_resistance: 100_000,
        prediction_24h: { upper: 101_000, center: 99_500, lower: 98_000 },
        prediction_7d: { upper: 110_000, center: 100_000, lower: 95_000 },
      },
      probability: { up: 0.5, flat: 0.2, down: 0.3 },
      momentum: {
        changes: { "4h": 1, "12h": 2, "24h": 3, "3d": 4, "7d": 5 },
        score: 10,
        acceleration: "up",
      },
      alerts: [],
    });
    expect(r.symbol).toBe("BTC");
    expect(r.currentPrice).toBe(99_000);
    expect(r.direction).toBe("bullish");
    expect(r.overallScore).toBe(25);
    expect(r.priceRange.support).toBe(90_000);
    expect(r.probability.up).toBe(0.5);
  });

  it("treats low score as bearish", () => {
    const r = parseTrendOutput({
      trend: { total_score: -30 },
      price_range: {},
      probability: {},
      momentum: {},
    });
    expect(r.direction).toBe("bearish");
  });
});
