// h.v2.strategy.copy_signal · Mock 实现单元测试

import { describe, expect, it } from "vitest";
import { copySignal } from "./index";
import { makeMockCtx } from "../../../test-helpers";

describe("h.v2.strategy.copy_signal", () => {
  it("合理预算 → OK", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [true] });
    const r = await copySignal(
      { signalSource: "smart_money", maxPositionPerCopy: "200", totalBudget: "1000" },
      ctx,
    );

    expect(r.code).toBe("OK");
    expect(ui.cards[0].kind).toBe("strategy.copy_signal.preview");
    expect(ui.events[0].kind).toBe("strategy.copy_signal.armed");
    // 必须有合规提醒
    const card = ui.cards[0].data as { complianceNotice: string };
    expect(card.complianceNotice).toMatch(/不保证盈利/);
  });

  it("单笔上限 × 5 > 总预算时拒绝 (防止单笔吃光)", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [true] });
    const r = await copySignal(
      { maxPositionPerCopy: "300", totalBudget: "1000" },
      ctx,
    );
    expect(r.code).toBe("RISK_REJECTED");
    expect(ui.cards).toHaveLength(0);
  });

  it("用户拒绝 → USER_CANCELED", async () => {
    const { ctx } = makeMockCtx({ confirmQueue: [false] });
    const r = await copySignal(
      { maxPositionPerCopy: "100", totalBudget: "1000" },
      ctx,
    );
    expect(r.code).toBe("USER_CANCELED");
  });

  it("KOL 信号源选项被允许 (但内部映射到链上聚合)", async () => {
    const { ctx } = makeMockCtx({ confirmQueue: [true] });
    const r = await copySignal(
      {
        signalSource: "kol_aggregated",
        maxPositionPerCopy: "100",
        totalBudget: "1000",
      },
      ctx,
    );
    expect(r.code).toBe("OK");
    if (r.code === "OK") {
      const data = r.data as { config: { signalSource: string } };
      expect(data.config.signalSource).toBe("kol_aggregated");
    }
  });

  it("风控拒绝", async () => {
    const { ctx } = makeMockCtx({ riskOk: false, riskReason: "budget_too_high" });
    const r = await copySignal({ totalBudget: "999999" }, ctx);
    expect(r.code).toBe("RISK_REJECTED");
  });
});
