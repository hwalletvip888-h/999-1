import { afterEach, describe, expect, it, vi } from "vitest";

describe("telegram-alert", () => {
  const saved = {
    token: process.env.HWALLET_TELEGRAM_ALERT_BOT_TOKEN,
    chat: process.env.HWALLET_TELEGRAM_ALERT_CHAT_ID,
    minIv: process.env.HWALLET_TELEGRAM_ALERT_MIN_INTERVAL_MS,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    if (saved.token !== undefined) process.env.HWALLET_TELEGRAM_ALERT_BOT_TOKEN = saved.token;
    else delete process.env.HWALLET_TELEGRAM_ALERT_BOT_TOKEN;
    if (saved.chat !== undefined) process.env.HWALLET_TELEGRAM_ALERT_CHAT_ID = saved.chat;
    else delete process.env.HWALLET_TELEGRAM_ALERT_CHAT_ID;
    if (saved.minIv !== undefined) process.env.HWALLET_TELEGRAM_ALERT_MIN_INTERVAL_MS = saved.minIv;
    else delete process.env.HWALLET_TELEGRAM_ALERT_MIN_INTERVAL_MS;
  });

  it("sendTelegramTestMessage returns friendly error when not configured", async () => {
    delete process.env.HWALLET_TELEGRAM_ALERT_BOT_TOKEN;
    delete process.env.HWALLET_TELEGRAM_ALERT_CHAT_ID;
    const mod = await import("./telegram-alert");
    const r = await mod.sendTelegramTestMessage();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/未配置/);
  });

  it("sendTelegramTestMessage calls Telegram when configured and API ok", async () => {
    process.env.HWALLET_TELEGRAM_ALERT_BOT_TOKEN = "123:abc";
    process.env.HWALLET_TELEGRAM_ALERT_CHAT_ID = "999";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("./telegram-alert");
    const r = await mod.sendTelegramTestMessage();
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.telegram.org");
    expect(url).toContain("123:abc");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe("999");
    expect(body.text).toContain("连通测试");
  });

  it("notifyTelegramAlertThrottled dedupes by category when interval is large", async () => {
    process.env.HWALLET_TELEGRAM_ALERT_BOT_TOKEN = "1:tok";
    process.env.HWALLET_TELEGRAM_ALERT_CHAT_ID = "1";
    process.env.HWALLET_TELEGRAM_ALERT_MIN_INTERVAL_MS = "3600000";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("./telegram-alert");
    mod.notifyTelegramAlertThrottled("same", ["a"]);
    mod.notifyTelegramAlertThrottled("same", ["b"]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
