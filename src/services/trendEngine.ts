/**
 * Trend Engine 集成服务（React Native 兼容版）
 *
 * 在 RN 环境中无法直接读取文件系统，
 * 因此通过 HTTP 请求从 walletBackend GET /api/trend 获取趋势数据，
 * 或者返回默认占位文本。
 *
 * 在 Node.js 环境（tsx 运行）中可以直接读取文件。
 */
import { getHwalletApiBase } from "./walletApiCore";
import { getWithTimeout } from "./walletApiHttp";
import { parseTrendOutput, type TrendReport } from "../trend/trendParse";

export type { TrendReport };

// 检测是否在 Node.js 环境
const isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;

// 缓存最近一次获取的报告
let _cachedReport: TrendReport | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 分钟缓存

/**
 * 获取最新的趋势分析报告（RN 兼容）
 */
export function getLatestTrendReport(): TrendReport | null {
  if (isNode) {
    return getLatestTrendReportNode();
  }
  // RN 环境返回缓存（异步获取在后台）
  refreshCacheAsync();
  return _cachedReport;
}

/**
 * 生成趋势摘要文本（用于 AI 对话回复）
 */
export function getTrendSummary(): string {
  const report = getLatestTrendReport();
  if (!report) return "暂无趋势分析数据。请稍后再试。";

  const dirIcon = report.overallScore > 20 ? "📈" : report.overallScore < -20 ? "📉" : "➡️";
  const confText = report.confidence === "high" ? "高" : report.confidence === "medium" ? "中" : "低";

  let summary = `🔮 **BTC 趋势分析** (${report.timestamp.slice(0, 16)})\n\n`;
  summary += `当前价格：$${report.currentPrice.toLocaleString()}\n`;
  summary += `方向：${dirIcon} ${report.directionCn}\n`;
  summary += `综合评分：${report.overallScore > 0 ? "+" : ""}${report.overallScore.toFixed(1)}\n`;
  summary += `置信度：${confText}\n`;
  summary += `概率分布：涨 ${(report.probability.up * 100).toFixed(0)}% / 平 ${(report.probability.flat * 100).toFixed(0)}% / 跌 ${(report.probability.down * 100).toFixed(0)}%\n`;
  summary += `\n📊 支撑/阻力：\n`;
  summary += `  支撑：$${report.priceRange.support.toLocaleString()}\n`;
  summary += `  阻力：$${report.priceRange.resistance.toLocaleString()}\n`;
  summary += `  24h 预测：$${report.priceRange.prediction24h.lower.toFixed(0)} ~ $${report.priceRange.prediction24h.upper.toFixed(0)}\n`;
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

/**
 * 获取最近 N 份报告
 */
export function getRecentReports(count = 5): TrendReport[] {
  if (isNode) {
    return getRecentReportsNode(count);
  }
  // RN 环境只返回缓存的单条
  return _cachedReport ? [_cachedReport] : [];
}

// ─── RN 环境：异步刷新缓存 ─────────────────────────────────────
async function refreshCacheAsync() {
  if (Date.now() - _cacheTime < CACHE_TTL) return;
  if (!getHwalletApiBase()) return;
  try {
    const resp = await getWithTimeout("/api/trend");
    if (resp?.ok) {
      const data = await resp.json();
      if (data && data.report) {
        _cachedReport = data.report;
        _cacheTime = Date.now();
      }
    }
  } catch {
    // 静默失败，使用缓存
  }
}

// ─── Node.js 环境：直接读取文件 ────────────────────────────────
function getLatestTrendReportNode(): TrendReport | null {
  try {
    const fs = require("fs");
    const path = require("path");
    const TREND_OUTPUT_DIR = path.join(process.env.HOME || "/root", "trend_engine/output");

    if (!fs.existsSync(TREND_OUTPUT_DIR)) return null;

    const files = fs
      .readdirSync(TREND_OUTPUT_DIR)
      .filter((f: string) => f.startsWith("report_") && f.endsWith(".json"))
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const latestFile = path.join(TREND_OUTPUT_DIR, files[0]);
    const content = fs.readFileSync(latestFile, "utf-8");
    const raw = JSON.parse(content) as Record<string, unknown>;

    const btcData =
      (raw.BTC as Record<string, unknown>) ||
      (raw.btc as Record<string, unknown>) ||
      (Object.values(raw)[0] as Record<string, unknown> | undefined);
    if (!btcData || typeof btcData !== "object") return null;

    return parseTrendOutput(btcData);
  } catch {
    return null;
  }
}

function getRecentReportsNode(count: number): TrendReport[] {
  try {
    const fs = require("fs");
    const path = require("path");
    const TREND_OUTPUT_DIR = path.join(process.env.HOME || "/root", "trend_engine/output");

    if (!fs.existsSync(TREND_OUTPUT_DIR)) return [];

    const files = fs
      .readdirSync(TREND_OUTPUT_DIR)
      .filter((f: string) => f.startsWith("report_") && f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, count);

    return files
      .map((f: string) => {
        const content = fs.readFileSync(path.join(TREND_OUTPUT_DIR, f), "utf-8");
        const raw = JSON.parse(content) as Record<string, unknown>;
        const btcData =
          (raw.BTC as Record<string, unknown>) ||
          (raw.btc as Record<string, unknown>) ||
          (Object.values(raw)[0] as Record<string, unknown> | undefined);
        return btcData && typeof btcData === "object" ? parseTrendOutput(btcData) : null;
      })
      .filter(Boolean) as TrendReport[];
  } catch {
    return [];
  }
}
