import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildLocalRuleIntentPayload,
  sanitizeIntentPayload,
  localRuleIntent,
  CHAT_INTENT_ACTIONS,
} from "./intentNormalize";

describe("sanitizeIntentPayload", () => {
  let prevEnv: string | undefined;
  beforeEach(() => {
    prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
  });
  afterEach(() => {
    if (prevEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it("maps aliases and clamps leverage", () => {
    const out = sanitizeIntentPayload({
      action: "market",
      symbol: "btc/usdt",
      amount: 50,
      leverage: 999,
      reply: "ok",
    });
    expect(out.action).toBe("price");
    expect(out.symbol).toBe("BTCUSDT");
    expect(out.amount).toBe(50);
    expect(out.leverage).toBeUndefined();
    expect(out.reply).toBe("ok");
  });

  it("unknown action becomes chat", () => {
    const out = sanitizeIntentPayload({ action: "buy_nft", reply: "x" });
    expect(out.action).toBe("chat");
  });
});

describe("localRuleIntent", () => {
  it("matches signal before earn", () => {
    const i = localRuleIntent("看看聪明钱最近在买什么");
    expect(i.action).toBe("signal");
  });

  it("portfolio 总资产", () => {
    const i = localRuleIntent("总资产多少");
    expect(i.action).toBe("portfolio");
  });
});

describe("CHAT_INTENT_ACTIONS", () => {
  it("includes signal and chat", () => {
    expect(CHAT_INTENT_ACTIONS).toContain("signal");
    expect(CHAT_INTENT_ACTIONS).toContain("chat");
  });
});

describe("buildLocalRuleIntentPayload", () => {
  it("永续 命中 trade_long", () => {
    const raw = buildLocalRuleIntentPayload("开永续多 100U");
    expect(raw.action).toBe("trade_long");
  });
});
