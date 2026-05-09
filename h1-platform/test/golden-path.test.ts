import { describe, expect, it } from "vitest";
import { MockH1IntegrationOkx, FlakyMockH1IntegrationOkx, runDemoTransferFlow, MemoryAuditPlatform, MemoryCardVault } from "../src/index.js";

describe("H1 golden path — 转 100U 到绑定 OKX", () => {
  it("完成转账、生成完成卡、收录卡库、审计可查询", async () => {
    const integration = new MockH1IntegrationOkx();
    const audit = new MemoryAuditPlatform();
    const cardVault = new MemoryCardVault();

    const out = await runDemoTransferFlow({
      userMessage: "帮我转100U到我绑定的OKX地址",
      profile: {
        userId: "u1",
        boundOkxAddress: "0xabcdef1234567890abcdef1234567890abcd",
      },
      integration,
      audit,
      cardVault,
    });

    expect(out.status).toBe("ok");
    if (out.status !== "ok") throw new Error("expected ok");

    expect(out.completionCard.title).toBe("转账已完成");
    expect(out.completionCard.amountUsd).toBe(100);
    expect(out.cardsInVault).toBe(1);
    expect(out.auditEntriesForTrace).toBeGreaterThan(0);
    expect(out.execution.txHash).toMatch(/^0xmock_/);

    const trace = audit.queryTrace(out.execution.traceId);
    expect(trace.some((e) => e.name === "h1.orchestration.execution.completed")).toBe(true);
  });

  it("未绑定地址时进入澄清", async () => {
    const out = await runDemoTransferFlow({
      userMessage: "帮我转100U到我绑定的OKX地址",
      profile: { userId: "u2" },
      integration: new MockH1IntegrationOkx(),
    });
    expect(out.status).toBe("clarify");
    if (out.status !== "clarify") throw new Error("expected clarify");
    expect(out.questions.length).toBeGreaterThan(0);
  });

  it("接入层失败时返回 failed 且带错误码", async () => {
    const out = await runDemoTransferFlow({
      userMessage: "帮我转100U到我绑定的OKX地址",
      profile: {
        userId: "u3",
        boundOkxAddress: "0x1111111111111111111111111111111111111111",
      },
      integration: new FlakyMockH1IntegrationOkx(true),
    });
    expect(out.status).toBe("failed");
    if (out.status !== "failed") throw new Error("expected failed");
    expect(out.execution.success).toBe(false);
    expect(out.execution.errorCode).toBe("H1.OKX.TIMEOUT");
  });
});
