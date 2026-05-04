/**
 * H_SignalApi Mock 实现
 */

import type {
  IH_SignalApi,
  H_IndicatorSignal,
  H_CompositeSignal,
  H_SignalDirection,
} from '../../contracts/H_SignalApi';

export class MockH_SignalApi implements IH_SignalApi {
  async getIndicator(instId: string, indicator: H_IndicatorSignal['name']): Promise<H_IndicatorSignal> {
    const score = (Math.random() - 0.5) * 4;
    const direction: H_SignalDirection = score > 0.5 ? 'bullish' : score < -0.5 ? 'bearish' : 'neutral';

    const values: Record<string, Record<string, number>> = {
      EMA: { ema7: 67800, ema25: 67200, ema99: 65500 },
      RSI: { rsi14: 55 + Math.random() * 30 },
      MACD: { macd: score * 50, signal: score * 30, histogram: score * 20 },
      BB: { upper: 69000, middle: 67500, lower: 66000 },
      FUNDING_RATE: { rate: (Math.random() - 0.3) * 0.001 },
    };

    return {
      name: indicator,
      direction,
      score: Math.round(score * 10) / 10,
      value: values[indicator] || {},
      description: `${indicator} ${direction === 'bullish' ? '看多' : direction === 'bearish' ? '看空' : '中性'}`,
    };
  }

  async getCompositeSignal(instId: string): Promise<H_CompositeSignal> {
    const indicators = await Promise.all(
      (['EMA', 'RSI', 'MACD', 'BB', 'FUNDING_RATE'] as const).map((name) =>
        this.getIndicator(instId, name)
      )
    );

    const totalScore = indicators.reduce((sum, ind) => sum + ind.score, 0);
    const direction: H_SignalDirection = totalScore >= 3 ? 'bullish' : totalScore <= -3 ? 'bearish' : 'neutral';
    const suggestion = totalScore >= 3 ? 'open_long' as const : totalScore <= -3 ? 'open_short' as const : 'hold' as const;

    return {
      instId,
      totalScore: Math.round(totalScore * 10) / 10,
      direction,
      indicators,
      suggestion,
      confidence: Math.min(Math.abs(totalScore) / 5, 1),
      timestamp: Date.now(),
    };
  }

  async getSignals(instIds: string[]): Promise<H_CompositeSignal[]> {
    return Promise.all(instIds.map((id) => this.getCompositeSignal(id)));
  }
}
