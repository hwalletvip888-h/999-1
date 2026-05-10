import { describe, expect, it } from "vitest";
import { parseDexSwapBody, parseWalletSendBody, parseSwitchAccountBody } from "./walletDex";

describe("parseDexSwapBody", () => {
  it("accepts valid swap payload", () => {
    const r = parseDexSwapBody({
      fromChain: "xlayer",
      fromSymbol: "USDT",
      fromAmount: "10",
      toChain: "xlayer",
      toSymbol: "ETH",
      slippageBps: 50,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects empty symbol", () => {
    const r = parseDexSwapBody({
      fromChain: "xlayer",
      fromSymbol: "",
      fromAmount: "1",
      toChain: "xlayer",
      toSymbol: "ETH",
    });
    expect(r.ok).toBe(false);
  });
});

describe("parseWalletSendBody", () => {
  it("accepts valid send", () => {
    const r = parseWalletSendBody({
      chain: "bsc",
      symbol: "USDT",
      toAddress: "0x1234567890123456789012345678901234567890",
      amount: "1",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects missing chain", () => {
    const r = parseWalletSendBody({
      symbol: "USDT",
      toAddress: "0x",
      amount: "1",
    } as any);
    expect(r.ok).toBe(false);
  });
});

describe("parseSwitchAccountBody", () => {
  it("requires accountId", () => {
    expect(parseSwitchAccountBody({ accountId: "acc1" }).ok).toBe(true);
    expect(parseSwitchAccountBody({}).ok).toBe(false);
  });
});
