// h.v2.strategy.dip_buy · Mock 实现单元测试

import { describe, expect, it } from "vitest";
import { dipBuy } from "./index";
import { makeMockCtx } from "../../../test-helpers";

describe("h.v2.strategy.dip_buy", () => {
  it("正常抄底单 (BTC 跌到 90000) → OK", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [true] });
    const r = await dipBuy(
      { targetAsset: "BTC", triggerPrice: "90000", amount: "5000" },
      ctx,
    );

    expect(r.code).toBe("OK");
    expect(ui.cards[0].kind).toBe("strategy.dip_buy.preview");
    expect(ui.events[0].kind).toBe("strategy.dip_buy.armed");
  });

  it("触发价 ≥ 当前价时拒绝 (这是抄底不是追涨)", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [true] });
    const r = await dipBuy(
      { targetAsset: "BTC", triggerPrice: "200000", amount: "5000" },
      ctx,
    );

    expect(r.code).toBe("RISK_REJECTED");
    expect(ui.cards).toHaveLength(0);
    if (r.code === "RISK_REJECTED") {
      expect(r.reason).toMatch(/必须 < 当前价/);
    }
  });

  it("用户拒绝 → USER_CANCELED", async () => {
    const { ctx } = makeMockCtx({ confirmQueue: [false] });
    const r = await dipBuy(
      { targetAsset: "ETH", triggerPrice: "2500", amount: "1000" },
      ctx,
    );
    expect(r.code).toBe("USER_CANCELED");
  });

  it("风控拒绝", async () => {
    const { ctx } = makeMockCtx({ riskOk: false, riskReason: "balance_insufficient" });
    const r = await dipBuy({ amount: "999999" }, ctx);
    expect(r.code).toBe("RISK_REJECTED");
  });
});
