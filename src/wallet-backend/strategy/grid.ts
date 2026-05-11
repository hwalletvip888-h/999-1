/**
 * 网格套利策略 — 在 ETH/USDC 设定价格区间，价格触及格线时自动 swap
 */
import { appendLog, clearTimer, isRunning, setTimer } from "./runner";
import { runOnchainosJson } from "../onchainos-cli";

const CHECK_INTERVAL_MS = 45_000;
const GRID_STEP_USDC    = "3";

const gridState: Record<string, { floor: number; ceil: number; step: number; last: number }> = {};

export function runGridStrategy(userId: string, home: string) {
  appendLog(userId, "info", "网格套利策略初始化，获取 ETH 当前价格设定网格区间...");

  const timer = setInterval(() => {
    if (!isRunning(userId)) { clearInterval(timer); return; }

    try {
      appendLog(userId, "info", "查询 ETH/USDC 网格报价...");

      const result = runOnchainosJson(
        ["swap", "quote",
          "--from", "USDC", "--to", "ETH",
          "--readable-amount", GRID_STEP_USDC,
          "--chain", "eth"
        ],
        home, 20_000
      ) as { ok?: boolean; toAmount?: string; rate?: number } | null;

      if (!result?.ok || !result.toAmount) {
        appendLog(userId, "warn", "报价接口暂时无法返回，等待下次检查...");
        return;
      }

      const rate = result.rate ?? 0;
      const ethPrice = rate > 0 ? 1 / rate : (Number(GRID_STEP_USDC) / Number(result.toAmount));

      const gs = gridState[userId];

      // 首次运行：初始化网格区间（±5%，1% 一格）
      if (!gs) {
        const step = ethPrice * 0.01;
        gridState[userId] = { floor: ethPrice * 0.95, ceil: ethPrice * 1.05, step, last: ethPrice };
        appendLog(userId, "info",
          `网格区间已设定：$${(ethPrice * 0.95).toFixed(0)} ～ $${(ethPrice * 1.05).toFixed(0)}，格步 $${step.toFixed(1)}`
        );
        appendLog(userId, "info", `当前 ETH $${ethPrice.toFixed(2)}，监控中...`);
        return;
      }

      if (ethPrice < gs.floor) {
        appendLog(userId, "warn", `ETH 跌破下轨 $${gs.floor.toFixed(0)}，暂停建仓，等待回升...`);
        return;
      }
      if (ethPrice > gs.ceil) {
        appendLog(userId, "warn", `ETH 突破上轨 $${gs.ceil.toFixed(0)}，暂停加仓，等待回调...`);
        return;
      }

      const crossed = Math.floor(Math.abs(ethPrice - gs.last) / gs.step);
      if (crossed >= 1) {
        const dir = ethPrice > gs.last ? "上穿" : "下穿";
        appendLog(userId, "action",
          `价格${dir}格线 $${ethPrice.toFixed(2)}（跨越 ${crossed} 格），触发 swap ${GRID_STEP_USDC} USDC → ETH`
        );
        try {
          const exec = runOnchainosJson(
            ["swap", "execute",
              "--from", "USDC", "--to", "ETH",
              "--readable-amount", GRID_STEP_USDC,
              "--chain", "eth", "--slippage", "80", "--force"
            ],
            home, 120_000
          ) as { ok?: boolean; txHash?: string; error?: string } | null;

          if (exec?.ok && exec.txHash) {
            appendLog(userId, "success", `网格成交 ✓  txHash: ${exec.txHash.slice(0, 14)}...`);
          } else {
            appendLog(userId, "error", `网格 swap 失败：${exec?.error ?? "未知错误"}`);
          }
        } catch (e: any) {
          appendLog(userId, "error", `网格执行异常：${e?.message ?? String(e)}`);
        }
        gridState[userId].last = ethPrice;
      } else {
        const diff = (ethPrice - gs.last).toFixed(2);
        appendLog(userId, "info",
          `ETH $${ethPrice.toFixed(2)}（区间内，距格线 $${(gs.step - Math.abs(ethPrice - gs.last)).toFixed(1)}，变动 ${Number(diff) > 0 ? "+" : ""}${diff}）`
        );
      }
    } catch (e: any) {
      appendLog(userId, "error", `网格运行异常：${e?.message ?? String(e)}`);
    }
  }, CHECK_INTERVAL_MS);

  setTimer(userId, timer);
  appendLog(userId, "info", `网格监控就绪，每 ${CHECK_INTERVAL_MS / 1000}s 检查价格...`);
}
