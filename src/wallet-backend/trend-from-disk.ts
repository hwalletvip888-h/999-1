import * as fs from "fs";
import * as nodePath from "path";
import { parseTrendOutput, type TrendReport } from "../trend/trendParse";

function trendOutputDir(): string {
  const fromEnv = (process.env.HWALLET_TREND_OUTPUT_DIR || "").trim();
  if (fromEnv) return fromEnv;
  return nodePath.join(process.env.HOME || "/root", "trend_engine/output");
}

/**
 * 读取 trend_engine 目录下最新一份 report_*.json，解析 BTC（或首个币种）为 TrendReport。
 */
export function readLatestTrendReportFromDisk(): TrendReport | null {
  try {
    const TREND_OUTPUT_DIR = trendOutputDir();
    if (!fs.existsSync(TREND_OUTPUT_DIR)) return null;

    const files = fs
      .readdirSync(TREND_OUTPUT_DIR)
      .filter((f) => f.startsWith("report_") && f.endsWith(".json"))
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const latestFile = nodePath.join(TREND_OUTPUT_DIR, files[0]);
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

export type { TrendReport };
