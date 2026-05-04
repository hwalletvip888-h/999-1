// bootstrap.ts 集成测试: 5 类 impl 全部注册成功且 dispatch 路由正确.

import { describe, expect, it, beforeEach } from "vitest";
import { bootstrapSkills } from "./bootstrap";
import { _resetSkillRegistryForTests, getSkillRegistry } from "./registry";
import { makeMockCtx } from "./test-helpers";

describe("bootstrap (集成)", () => {
  beforeEach(() => {
    _resetSkillRegistryForTests();
  });

  it("bootstrap 后 5 类 skill 都标 hasImpl=true", () => {
    bootstrapSkills();
    const reg = getSkillRegistry();
    const list = reg.list();
    expect(list).toHaveLength(5);
    expect(list.every((e) => e.hasImpl)).toBe(true);
  });

  it("bootstrap 后 dispatch 真实进 impl 函数, 走通确认门", async () => {
    bootstrapSkills();
    const reg = getSkillRegistry();
    const { ctx } = makeMockCtx({ confirmQueue: [true] });

    const r = await reg.dispatch(
      "h.v2.strategy.dca",
      { targetAsset: "BTC", amountPerPeriod: "100", period: "weekly" },
      ctx,
    );
    expect(r.code).toBe("OK");
  });

  it("toAnthropicTools 在 bootstrap 后仍然返回 5 条 (与 impl 注册无关)", () => {
    bootstrapSkills();
    const reg = getSkillRegistry();
    expect(reg.toAnthropicTools()).toHaveLength(5);
  });

  it("5 个 mvpType 都覆盖到 (1-5 各一个)", () => {
    bootstrapSkills();
    const reg = getSkillRegistry();
    const types = reg
      .list()
      .map((e) => e.mvpType)
      .filter((t): t is number => typeof t === "number")
      .sort();
    expect(types).toEqual([1, 2, 3, 4, 5]);
  });
});
