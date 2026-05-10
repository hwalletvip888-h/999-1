/**
 * 可选：通过 Telegram Bot 发送运维告警（不落盘 token / chat_id 到日志正文）。
 * 环境变量：HWALLET_TELEGRAM_ALERT_BOT_TOKEN、HWALLET_TELEGRAM_ALERT_CHAT_ID。
 */
import {
  TELEGRAM_ALERT_BOT_TOKEN,
  TELEGRAM_ALERT_CHAT_ID,
  TELEGRAM_ALERT_MIN_INTERVAL_MS,
  WALLET_PORT,
} from "./config";
import { fetchWithServerTimeout } from "./server-fetch";

const lastSentMsByCategory = new Map<string, number>();

export function isTelegramAlertConfigured(): boolean {
  return Boolean(TELEGRAM_ALERT_BOT_TOKEN && TELEGRAM_ALERT_CHAT_ID);
}

function clipTelegramText(text: string): string {
  const max = 3900;
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n…(truncated)";
}

async function postTelegramSendMessage(text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isTelegramAlertConfigured()) {
    return { ok: false, error: "Telegram 告警未配置：请设置 HWALLET_TELEGRAM_ALERT_BOT_TOKEN 与 HWALLET_TELEGRAM_ALERT_CHAT_ID" };
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_ALERT_BOT_TOKEN}/sendMessage`;
  let res: Response;
  try {
    res = await fetchWithServerTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_ALERT_CHAT_ID,
          text: clipTelegramText(text),
          disable_web_page_preview: true,
        }),
      },
      10_000,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Telegram 请求失败：${msg}` };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: `Telegram 响应非 JSON（HTTP ${res.status}）` };
  }
  const ok = Boolean((body as { ok?: boolean })?.ok);
  if (!res.ok || !ok) {
    const desc = String((body as { description?: string })?.description || "").trim();
    return { ok: false, error: desc || `Telegram API 错误（HTTP ${res.status}）` };
  }
  return { ok: true };
}

/**
 * 运维手动探活：不受节流影响；失败返回可读 error（不含 token）。
 */
export async function sendTelegramTestMessage(): Promise<{ ok: true } | { ok: false; error: string }> {
  const host = `pid=${process.pid} port=${WALLET_PORT}`;
  const text = `[H Wallet BFF]\n连通测试 OK\n${host}\n${new Date().toISOString()}`;
  return postTelegramSendMessage(text);
}

/**
 * 按 category 节流发送（同一 category 在 TELEGRAM_ALERT_MIN_INTERVAL_MS 内最多一条），避免刷屏。
 * 始终 fire-and-forget：内部吞掉异常，仅 console.warn。
 */
export function notifyTelegramAlertThrottled(category: string, lines: string[]): void {
  if (!isTelegramAlertConfigured()) return;
  const now = Date.now();
  const prev = lastSentMsByCategory.get(category) ?? 0;
  if (now - prev < TELEGRAM_ALERT_MIN_INTERVAL_MS) return;
  lastSentMsByCategory.set(category, now);
  const text = [`[H Wallet BFF]`, `类型: ${category}`, ...lines].join("\n");
  void postTelegramSendMessage(text).then((r) => {
    if (!r.ok) console.warn("[telegram-alert]", r.error);
  });
}
