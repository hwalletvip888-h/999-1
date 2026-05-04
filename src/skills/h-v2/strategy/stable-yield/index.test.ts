// h.v2.strategy.stable_yield · Mock 实现单元测试

import { describe, expect, it } from "vitest";
import { stableYield } from "./index";
import { makeMockCtx } from "../../../test-helpers";

describe("h.v2.strategy.stable_yield", () => {
  it("默认参数走完用户确认 → 部署 → 返回 OK", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [true] });
    const r = await stableYield({}, ctx);

    expect(r.code).toBe("OK");
    expect(ui.cards).toHaveLength(1);
    expect(ui.cards[0].kind).toBe("strategy.stable_yield.preview");
    // 默认 splitInto=3, 应该有 3 个 deploy_step + 1 个 deployed
    expect(ui.events.filter((e) => e.kind === "strategy.deploy_step")).toHaveLength(3);
    expect(ui.events.filter((e) => e.kind === "strategy.deployed")).toHaveLength(1);
    if (r.code === "OK") {
      const data = r.data as { strategyId: string; pools: unknown[] };
      expect(data.strategyId).toMatch(/^h-v2-stable-yield-/);
      expect(data.pools).toHaveLength(3);
    }
  });

  it("用户在确认门拒绝 → 返回 USER_CANCELED, 不部署", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [false] });
    const r = await stableYield({ amount: "1000" }, ctx);

    expect(r.code).toBe("USER_CANCELED");
    expect(ui.cards).toHaveLength(1);
    expect(ui.events).toHaveLength(0); // 没部署
  });

  it("风控拒绝时直接返回 RISK_REJECTED, 不弹卡片", async () => {
    const { ctx, ui } = makeMockCtx({ riskOk: false, riskReason: "amount_exceeds_30pct" });
    const r = await stableYield({ amount: "100000" }, ctx);

    expect(r.code).toBe("RISK_REJECTED");
    expect(ui.cards).toHaveLength(0);
    if (r.code === "RISK_REJECTED") {
      expect(r.reason).toBe("amount_exceeds_30pct");
    }
  });

  it("splitInto=1 时只部署 1 个池", async () => {
    const { ctx, ui } = makeMockCtx({ confirmQueue: [true] });
    const r = await stableYield({ splitInto: 1 }, ctx);

    expect(r.code).toBe("OK");
    expect(ui.events.filter((e) => e.kind === "strategy.deploy_step")).toHaveLength(1);
  });
});
