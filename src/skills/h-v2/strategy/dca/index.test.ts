// h.v2.strategy.dca · Mock 实现单元测试

import { describe, expect, it } from "vitest";
import { dca } from "./index";
import { makeMockCtx } from "../../../test-helpers";

describe("h.v2.strategy.dca", () => {
  it("用户确认 → 注册 schedule, 返回 OK", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [true] });
    const r = await dca(
      { targetAsset: "BTC", amountPerPeriod: "100", period: "weekly", totalBudget: "5200" },
      ctx,
    );

    expect(r.code).toBe("OK");
    expect(ui.cards[0].kind).toBe("strategy.dca.preview");
    expect(ui.events[0].kind).toBe("strategy.dca.scheduled");
    if (r.code === "OK") {
      const data = r.data as { schedule: { period: string; estimatedRunsLeft: number } };
      expect(data.schedule.period).toBe("weekly");
      expect(data.schedule.estimatedRunsLeft).toBe(52);
    }
  });

  it("无 totalBudget 时 estimatedRunsLeft = null", async () => {
    const { ctx } = makeMockCtx({ confirmQueue: [true] });
    const r = await dca({ amountPerPeriod: "100", period: "daily" }, ctx);

    expect(r.code).toBe("OK");
    if (r.code === "OK") {
      const data = r.data as { schedule: { estimatedRunsLeft: number | null } };
      expect(data.schedule.estimatedRunsLeft).toBeNull();
    }
  });

  it("用户拒绝 → USER_CANCELED, 不入 schedule", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [false] });
    const r = await dca({ targetAsset: "ETH", amountPerPeriod: "50", period: "daily" }, ctx);

    expect(r.code).toBe("USER_CANCELED");
    expect(ui.events).toHaveLength(0);
  });

  it("风控拒绝", async () => {
    const { ctx } = makeMockCtx({ riskOk: false, riskReason: "amount_too_high" });
    const r = await dca({ amountPerPeriod: "1000000" }, ctx);
    expect(r.code).toBe("RISK_REJECTED");
  });
});
