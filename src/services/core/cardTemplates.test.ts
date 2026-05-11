import { describe, expect, it } from "vitest";
import { resolveCardTemplateId } from "./cardTemplates";
import type { HWalletCard } from "../../types/card";

function baseCard(p: Partial<HWalletCard>): HWalletCard {
  return {
    id: "t",
    productLine: "v6",
    module: "wallet",
    cardType: "info",
    header: "信息卡片",
    title: "T",
    riskLevel: "低",
    status: "preview",
    simulationMode: false,
    userPrompt: "",
    aiSummary: "",
    createdAt: new Date().toISOString(),
    ...p,
  } as HWalletCard;
}

describe("resolveCardTemplateId", () => {
  it("transfer_select", () => {
    const c = baseCard({
      cardType: "wallet_action",
      transferSelectMode: true,
      amount: 10,
      symbol: "USDT",
    });
    expect(resolveCardTemplateId(c)).toBe("transfer_select");
  });

  it("transfer", () => {
    const c = baseCard({
      cardType: "wallet_action",
      toAddress: "0x" + "1".repeat(40),
      transferChain: "evm",
      amount: 10,
      symbol: "USDT",
    });
    expect(resolveCardTemplateId(c)).toBe("transfer");
  });

  it("transfer_receipt", () => {
    const c = baseCard({
      status: "executed",
      toAddress: "0x" + "2".repeat(40),
      amount: 1,
      symbol: "USDT",
      rows: [{ label: "交易哈希", value: "0xabc" }],
    });
    expect(resolveCardTemplateId(c)).toBe("transfer_receipt");
  });

  it("stake over generic when stakeProtocol set", () => {
    const c = baseCard({
      productLine: "v6",
      module: "earn",
      cardType: "trade",
      stakeProtocol: "Aave",
      stakeApy: "5",
      stakeAmount: "100 USDT",
    });
    expect(resolveCardTemplateId(c)).toBe("stake");
  });

  it("deposit", () => {
    const c = baseCard({
      depositAddresses: [{ chain: "evm", label: "E", address: "0x" + "3".repeat(40) }],
    });
    expect(resolveCardTemplateId(c)).toBe("deposit");
  });
});
