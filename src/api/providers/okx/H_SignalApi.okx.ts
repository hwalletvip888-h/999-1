/**
 * H_SignalApi OKX 实盘实现
 * 基于 okx-contract-monitor 策略引擎模板改写
 *
 * 多指标共振趋势跟踪：EMA(7/25/99) + RSI(14) + MACD + 布林带 + 资金费率
 * 评分制信号判定：score ≥ 3 做多，score ≤ -3 做空，其余观望
 */

import type {
  IH_SignalApi,
  H_IndicatorSignal,
  H_CompositeSignal,
  H_SignalDirection,
} from '../../contracts/H_SignalApi';
import * as okxClient from './okxClient';

// ─── 技术指标计算 ──────────────────────────────────────────────

function calcEMA(data: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

function calcMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  _signal = 9
): { macdLine: number; histogram: number } | null {
  if (closes.length < slow + _signal) return null;
  const emaFast = calcEMA(closes.slice(-fast * 2), fast);
  const emaSlow = calcEMA(closes.slice(-slow * 2), slow);
  const macdLine = emaFast - emaSlow;
  return { macdLine, histogram: macdLine * 0.3 };
}

function calcBollinger(
  closes: number[],
  period = 20,
  mult = 2
): { upper: number; middle: number; lower: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return { upper: mean + mult * std, middle: mean, lower: mean - mult * std };
}

// ─── 实现 ──────────────────────────────────────────────────────

export class OkxH_SignalApi implements IH_SignalApi {

  /** 获取 K 线收盘价数组 */
  private async getCloses(instId: string): Promise<{ closes: number[]; price: number }> {
    const [tickRes, candleRes] = await Promise.all([
      okxClient.getTicker(instId),
      okxClient.getCandles(instId, '1H', 100),
    ]);
    const price = parseFloat(tickRes.data?.[0]?.last || '0');
    const candles = (candleRes.data || []).reverse();
    const closes = candles.map((c: any) => parseFloat(c[4]));
    return { closes, price };
  }

  async getIndicator(
    instId: string,
    indicator: H_IndicatorSignal['name']
  ): Promise<H_IndicatorSignal> {
    const { closes, price } = await this.getCloses(instId);

    switch (indicator) {
      case 'EMA': {
        const emaFast = calcEMA(closes.slice(-14), 7);
        const emaMid = calcEMA(closes.slice(-50), 25);
        const emaSlow = calcEMA(closes.slice(-200), 99);
        let direction: H_SignalDirection = 'neutral';
        let score = 0;
        let description = 'EMA 中性';
        if (emaFast > emaMid && emaMid > emaSlow) {
          direction = 'bullish'; score = 2; description = 'EMA 多头排列 +2';
        } else if (emaFast < emaMid && emaMid < emaSlow) {
          direction = 'bearish'; score = -2; description = 'EMA 空头排列 -2';
        }
        return { name: 'EMA', direction, score, value: { ema7: emaFast, ema25: emaMid, ema99: emaSlow }, description };
      }

      case 'RSI': {
        const rsi = calcRSI(closes);
        let direction: H_SignalDirection = 'neutral';
        let score = 0;
        let description = 'RSI 中性';
        if (rsi !== null) {
          if (rsi > 70) { direction = 'bearish'; score = -1; description = `RSI ${rsi.toFixed(1)} 超买 -1`; }
          else if (rsi < 30) { direction = 'bullish'; score = 1; description = `RSI ${rsi.toFixed(1)} 超卖 +1`; }
          else if (rsi > 50 && rsi < 70) { direction = 'bullish'; score = 0.5; description = `RSI ${rsi.toFixed(1)} 偏多 +0.5`; }
          else if (rsi < 50 && rsi > 30) { direction = 'bearish'; score = -0.5; description = `RSI ${rsi.toFixed(1)} 偏空 -0.5`; }
        }
        return { name: 'RSI', direction, score, value: { rsi: rsi || 50 }, description };
      }

      case 'MACD': {
        const macd = calcMACD(closes);
        let direction: H_SignalDirection = 'neutral';
        let score = 0;
        let description = 'MACD 数据不足';
        if (macd) {
          if (macd.histogram > 0) { direction = 'bullish'; score = 1; description = 'MACD 柱状图为正 +1'; }
          else { direction = 'bearish'; score = -1; description = 'MACD 柱状图为负 -1'; }
        }
        return { name: 'MACD', direction, score, value: { macdLine: macd?.macdLine || 0, histogram: macd?.histogram || 0 }, description };
      }

      case 'BB': {
        const bb = calcBollinger(closes);
        let direction: H_SignalDirection = 'neutral';
        let score = 0;
        let description = '布林带中性';
        if (bb) {
          if (price < bb.lower) { direction = 'bullish'; score = 1; description = '价格低于布林下轨 +1'; }
          else if (price > bb.upper) { direction = 'bearish'; score = -1; description = '价格高于布林上轨 -1'; }
        }
        return { name: 'BB', direction, score, value: { upper: bb?.upper || 0, middle: bb?.middle || 0, lower: bb?.lower || 0 }, description };
      }

      case 'FUNDING_RATE': {
        const frRes = await okxClient.getFundingRate(instId);
        const fundingRate = parseFloat(frRes.data?.[0]?.fundingRate || '0');
        let direction: H_SignalDirection = 'neutral';
        let score = 0;
        let description = '资金费率中性';
        if (fundingRate > 0.001) { direction = 'bearish'; score = -0.5; description = `资金费率 ${(fundingRate * 100).toFixed(4)}% 偏高 -0.5`; }
        else if (fundingRate < -0.001) { direction = 'bullish'; score = 0.5; description = `资金费率 ${(fundingRate * 100).toFixed(4)}% 偏低 +0.5`; }
        return { name: 'FUNDING_RATE', direction, score, value: { fundingRate }, description };
      }

      default:
        throw new Error(`[H_SignalApi] 不支持的指标: ${indicator}`);
    }
  }

  async getCompositeSignal(instId: string): Promise<H_CompositeSignal> {
    const indicators = await Promise.all([
      this.getIndicator(instId, 'EMA'),
      this.getIndicator(instId, 'RSI'),
      this.getIndicator(instId, 'MACD'),
      this.getIndicator(instId, 'BB'),
      this.getIndicator(instId, 'FUNDING_RATE'),
    ]);

    const totalScore = indicators.reduce((sum, ind) => sum + ind.score, 0);
    const confidence = Math.min(Math.abs(totalScore) / 5, 1);

    let direction: H_SignalDirection = 'neutral';
    let suggestion: H_CompositeSignal['suggestion'] = 'hold';

    if (totalScore >= 3) {
      direction = 'bullish';
      suggestion = 'open_long';
    } else if (totalScore <= -3) {
      direction = 'bearish';
      suggestion = 'open_short';
    }

    return {
      instId,
      totalScore,
      direction,
      indicators,
      suggestion,
      confidence,
      timestamp: Date.now(),
    };
  }

  async getSignals(instIds: string[]): Promise<H_CompositeSignal[]> {
    // 串行执行避免 OKX 限流
    const results: H_CompositeSignal[] = [];
    for (const instId of instIds) {
      try {
        const signal = await this.getCompositeSignal(instId);
        results.push(signal);
      } catch (err: any) {
        console.warn(`[H_SignalApi] ${instId} 信号获取失败:`, err.message);
      }
    }
    return results;
  }
}
