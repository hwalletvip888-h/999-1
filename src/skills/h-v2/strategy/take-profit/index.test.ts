// h.v2.strategy.take_profit · Mock 实现单元测试

import { describe, expect, it } from "vitest";
import { takeProfit } from "./index";
import { makeMockCtx } from "../../../test-helpers";

describe("h.v2.strategy.take_profit", () => {
  it("正常止盈单 (BTC 涨到 150000 卖一半) → OK", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [true] });
    const r = await takeProfit(
      { holdingAsset: "BTC", triggerPrice: "150000", sellRatio: "half" },
      ctx,
    );

    expect(r.code).toBe("OK");
    expect(ui.cards[0].kind).toBe("strategy.take_profit.preview");
    if (r.code === "OK") {
      const data = r.data as { executionWhenTriggered: { sellRatio: number } };
      expect(data.executionWhenTriggered.sellRatio).toBe(0.5);
    }
  });

  it("触发价 ≤ 当前价时拒绝", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [true] });
    const r = await takeProfit(
      { holdingAsset: "BTC", triggerPrice: "50000", sellRatio: "half" },
      ctx,
    );
    expect(r.code).toBe("RISK_REJECTED");
    expect(ui.cards).toHaveLength(0);
  });

  it("没该资产持仓时拒绝", async () => {
    const { ctx } = makeMockCtx({ confirmQueue: [true] });
    const r = await takeProfit(
      { holdingAsset: "DOGE", triggerPrice: "1", sellRatio: "all" },
      ctx,
    );
    expect(r.code).toBe("RISK_REJECTED");
    if (r.code === "RISK_REJECTED") {
      expect(r.reason).toMatch(/没有 DOGE 持仓/);
    }
  });

  it("sellRatio='all' 标记 extraConfirm", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [true] });
    const r = await takeProfit(
      { holdingAsset: "ETH", triggerPrice: "5000", sellRatio: "all" },
      ctx,
    );
    expect(r.code).toBe("OK");
    const card = ui.cards[0].data as { extraConfirmIfRatioOne: boolean };
    expect(card.extraConfirmIfRatioOne).toBe(true);
  });
});
