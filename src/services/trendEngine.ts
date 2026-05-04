/**
 * Trend Engine 集成服务
 * 
 * 读取 ~/trend_engine/output/ 目录下最新的分析报告
 * 提供给 AI 对话和策略推荐使用
 */
import * as fs from 'fs';
import * as path from 'path';

const TREND_OUTPUT_DIR = path.join(process.env.HOME || '/root', 'trend_engine/output');

export interface TrendReport {
  timestamp: string;
  symbol: string;
  currentPrice: number;
  overallScore: number;        // -100 ~ +100
  direction: 'bullish' | 'bearish' | 'neutral';
  directionCn: string;
  confidence: string;          // 'high' | 'medium' | 'low'
  priceRange: {
    support: number;
    resistance: number;
    prediction24h: { upper: number; center: number; lower: number };
    prediction7d: { upper: number; center: number; lower: number };
  };
  probability: { up: number; flat: number; down: number };
  momentum: {
    changes: { '4h': number; '12h': number; '24h': number; '3d': number; '7d': number };
    score: number;
    acceleration: string;
  };
  breakdown: {
    technical: number;
    microstructure: number;
    smartmoney: number;
    momentum: number;
  };
  alerts: any[];
  recommendation: string;
}

/**
 * 获取最新的趋势分析报告
 */
export function getLatestTrendReport(): TrendReport | null {
  try {
    if (!fs.existsSync(TREND_OUTPUT_DIR)) return null;

    const files = fs.readdirSync(TREND_OUTPUT_DIR)
      .filter(f => f.startsWith('report_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const latestFile = path.join(TREND_OUTPUT_DIR, files[0]);
    const content = fs.readFileSync(latestFile, 'utf-8');
    const raw = JSON.parse(content);

    // trend_engine 输出格式: { "BTC": { ... } }
    const btcData = raw.BTC || raw.btc || Object.values(raw)[0];
    if (!btcData) return null;

    return parseTrendOutput(btcData);
  } catch (err) {
    console.warn('[TrendEngine] 读取报告失败:', err);
    return null;
  }
}

/**
 * 获取最近 N 份报告（用于趋势对比）
 */
export function getRecentReports(count = 5): TrendReport[] {
  try {
    if (!fs.existsSync(TREND_OUTPUT_DIR)) return [];

    const files = fs.readdirSync(TREND_OUTPUT_DIR)
      .filter(f => f.startsWith('report_') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, count);

    return files.map(f => {
      const content = fs.readFileSync(path.join(TREND_OUTPUT_DIR, f), 'utf-8');
      const raw = JSON.parse(content);
      const btcData = raw.BTC || raw.btc || Object.values(raw)[0];
      return btcData ? parseTrendOutput(btcData) : null;
    }).filter(Boolean) as TrendReport[];
  } catch {
    return [];
  }
}

/**
 * 生成趋势摘要文本（用于 AI 对话回复）
 */
export function getTrendSummary(): string {
  const report = getLatestTrendReport();
  if (!report) return '暂无趋势分析数据。trend_engine 可能未运行。';

  const dirIcon = report.overallScore > 20 ? '📈' : report.overallScore < -20 ? '📉' : '➡️';
  const confText = report.confidence === 'high' ? '高' : report.confidence === 'medium' ? '中' : '低';

  let summary = `🔮 **BTC 趋势分析** (${report.timestamp.slice(0, 16)})\n\n`;
  summary += `当前价格：$${report.currentPrice.toLocaleString()}\n`;
  summary += `方向：${dirIcon} ${report.directionCn}\n`;
  summary += `综合评分：${report.overallScore > 0 ? '+' : ''}${report.overallScore.toFixed(1)}\n`;
  summary += `置信度：${confText}\n`;
  summary += `概率分布：涨 ${(report.probability.up * 100).toFixed(0)}% / 平 ${(report.probability.flat * 100).toFixed(0)}% / 跌 ${(report.probability.down * 100).toFixed(0)}%\n`;
  summary += `\n📊 支撑/阻力：\n`;
  summary += `  支撑：$${report.priceRange.support.toLocaleString()}\n`;
  summary += `  阻力：$${report.priceRange.resistance.toLocaleString()}\n`;
  summary += `  24h 预测：$${report.priceRange.prediction24h.lower.toFixed(0)} ~ $${report.priceRange.prediction24h.upper.toFixed(0)}\n`;
  summary += `\n📈 动量变化：\n`;
  summary += `  4h: ${report.momentum.changes['4h'] > 0 ? '+' : ''}${report.momentum.changes['4h'].toFixed(2)}%`;
  summary += `  24h: ${report.momentum.changes['24h'] > 0 ? '+' : ''}${report.momentum.changes['24h'].toFixed(2)}%`;
  summary += `  7d: ${report.momentum.changes['7d'] > 0 ? '+' : ''}${report.momentum.changes['7d'].toFixed(2)}%\n`;
  summary += `\n🧠 维度评分：\n`;
  summary += `  技术面: ${report.breakdown.technical > 0 ? '+' : ''}${report.breakdown.technical.toFixed(1)}\n`;
  summary += `  微观结构: ${report.breakdown.microstructure > 0 ? '+' : ''}${report.breakdown.microstructure.toFixed(1)}\n`;
  summary += `  聪明钱: ${report.breakdown.smartmoney > 0 ? '+' : ''}${report.breakdown.smartmoney.toFixed(1)}\n`;
  summary += `  动量: ${report.breakdown.momentum > 0 ? '+' : ''}${report.breakdown.momentum.toFixed(1)}\n`;

  // 生成策略建议
  summary += `\n💡 策略建议：`;
  if (report.overallScore > 30) {
    summary += `趋势偏多，建议 DCA 分批做多或追踪止盈`;
  } else if (report.overallScore < -30) {
    summary += `趋势偏空，建议减仓观望或做空对冲`;
  } else {
    summary += `震荡区间，建议网格策略 $${report.priceRange.support.toFixed(0)}-$${report.priceRange.resistance.toFixed(0)}`;
  }

  return summary;
}

// ─── 内部解析 ─────────────────────────────────────────────────
function parseTrendOutput(data: any): TrendReport {
  const trend = data.trend || {};
  const score = trend.total_score ?? 0;
  const direction = score > 20 ? 'bullish' : score < -20 ? 'bearish' : 'neutral';
  const priceRange = data.price_range || {};
  const pred24h = priceRange.prediction_24h || {};
  const pred7d = priceRange.prediction_7d || {};
  const momentum = data.momentum || {};
  const prob = data.probability || {};
  const breakdown = trend.breakdown || {};

  return {
    timestamp: data.timestamp || new Date().toISOString(),
    symbol: data.coin || 'BTC',
    currentPrice: data.current_price || 0,
    overallScore: score,
    direction,
    directionCn: trend.direction || (direction === 'bullish' ? '看多' : direction === 'bearish' ? '看空' : '震荡'),
    confidence: trend.confidence || 'low',
    priceRange: {
      support: priceRange.nearest_support || 0,
      resistance: priceRange.nearest_resistance || 0,
      prediction24h: {
        upper: pred24h.upper || 0,
        center: pred24h.center || 0,
        lower: pred24h.lower || 0,
      },
      prediction7d: {
        upper: pred7d.upper || 0,
        center: pred7d.center || 0,
        lower: pred7d.lower || 0,
      },
    },
    probability: {
      up: prob.up || 0,
      flat: prob.flat || 0,
      down: prob.down || 0,
    },
    momentum: {
      changes: momentum.changes || { '4h': 0, '12h': 0, '24h': 0, '3d': 0, '7d': 0 },
      score: momentum.score || 0,
      acceleration: momentum.acceleration || 'unknown',
    },
    breakdown: {
      technical: breakdown.technical || 0,
      microstructure: breakdown.microstructure || 0,
      smartmoney: breakdown.smartmoney || 0,
      momentum: breakdown.momentum || 0,
    },
    alerts: data.alerts || [],
    recommendation: '',
  };
}
