/**
 * 趋势跟踪策略 — 监控 ETH/USDC 价差，超阈值自动执行 swap
 */
import { appendLog, clearTimer, isRunning, setTimer } from "./runner";
import { runOnchainosJson } from "../onchainos-cli";

const CHECK_INTERVAL_MS = 30_000;
const ENTRY_THRESHOLD   = 0.01;
const SWAP_AMOUNT_USDC  = "5";

const lastPrice: Record<string, number> = {};

export function runTrendStrategy(userId: string, home: string) {
  appendLog(userId, "info", "趋势跟踪策略初始化，监控 ETH/USDC 价格...");
  appendLog(userId, "info", `每 ${CHECK_INTERVAL_MS / 1000}s 轮询一次报价，触发阈值 ${ENTRY_THRESHOLD * 100}%`);

  const timer = setInterval(() => {
    if (!isRunning(userId)) { clearInterval(timer); return; }

    try {
      appendLog(userId, "info", "查询 ETH/USDC 实时报价...");

      const result = runOnchainosJson(
        ["swap", "quote",
          "--from", "USDC", "--to", "ETH",
          "--readable-amount", SWAP_AMOUNT_USDC,
          "--chain", "eth"
        ],
        home, 20_000
      ) as { ok?: boolean; toAmount?: string; rate?: number; priceImpactBps?: number } | null;

      if (!result?.ok || !result.toAmount) {
        appendLog(userId, "warn", "报价接口暂时无法返回数据，等待下次检查...");
        return;
      }

      const rate = result.rate ?? (Number(SWAP_AMOUNT_USDC) / Number(result.toAmount));
      const ethPrice = rate > 0 ? 1 / rate : 0;
      const impact = result.priceImpactBps ? `${(result.priceImpactBps / 100).toFixed(2)}%` : "<0.01%";

      appendLog(userId, "info", `当前 ETH 报价 ≈ $${ethPrice.toFixed(2)}，价格影响 ${impact}`);

      const prev = lastPrice[userId];
      if (prev && Math.abs(ethPrice - prev) / prev >= ENTRY_THRESHOLD) {
        const dir = ethPrice > prev ? "上涨" : "下跌";
        const pct = (Math.abs(ethPrice - prev) / prev * 100).toFixed(2);
        appendLog(userId, "action", `价格${dir} ${pct}%，触发买入信号 → 执行 swap ${SWAP_AMOUNT_USDC} USDC → ETH`);

        try {
          const exec = runOnchainosJson(
            ["swap", "execute",
              "--from", "USDC", "--to", "ETH",
              "--readable-amount", SWAP_AMOUNT_USDC,
              "--chain", "eth", "--slippage", "100", "--force"
            ],
            home, 120_000
          ) as { ok?: boolean; txHash?: string; error?: string } | null;

          if (exec?.ok && exec.txHash) {
            appendLog(userId, "success", `兑换成功 ✓  txHash: ${exec.txHash.slice(0, 14)}...`);
          } else {
            appendLog(userId, "error", `兑换失败：${exec?.error ?? "未知错误"}`);
          }
        } catch (e: any) {
          appendLog(userId, "error", `执行 swap 异常：${e?.message ?? String(e)}`);
        }
      } else if (!prev) {
        appendLog(userId, "info", `基准价格已记录：$${ethPrice.toFixed(2)}，开始监控变动...`);
      } else {
        const diff = ((ethPrice - prev) / prev * 100).toFixed(3);
        appendLog(userId, "info", `价格变动 ${diff}%（低于阈值），继续观察...`);
      }
      lastPrice[userId] = ethPrice;

    } catch (e: any) {
      appendLog(userId, "error", `策略运行异常：${e?.message ?? String(e)}`);
    }
  }, CHECK_INTERVAL_MS);

  setTimer(userId, timer);
}
