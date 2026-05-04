// SkillRegistry 单元测试
// 覆盖: loadManifests / 命名规则校验 / registerImpl / dispatch (NOT_IMPLEMENTED, 路由 OK, 错误)
//      / toAnthropicTools / list

import { describe, expect, it, beforeEach } from "vitest";
import { SkillRegistry, _resetSkillRegistryForTests } from "./registry";
import { ALL_H_SKILL_MANIFESTS } from "./manifests";
import { makeMockCtx } from "./test-helpers";
import type { SkillImpl, SkillManifest } from "./types";

describe("SkillRegistry", () => {
  let reg: SkillRegistry;

  beforeEach(() => {
    _resetSkillRegistryForTests();
    reg = new SkillRegistry();
  });

  it("loadManifests 加载全部 5 类 MVP manifest", () => {
    reg.loadManifests();
    const list = reg.list();
    expect(list).toHaveLength(5);
    expect(list.map((e) => e.name).sort()).toEqual([
      "h.v2.strategy.copy_signal",
      "h.v2.strategy.dca",
      "h.v2.strategy.dip_buy",
      "h.v2.strategy.stable_yield",
      "h.v2.strategy.take_profit",
    ]);
    // 都没 impl
    expect(list.every((e) => !e.hasImpl)).toBe(true);
  });

  it("命名违反 h.<v1|v2>.<domain>.<action> 格式时拒启动", () => {
    const bad: SkillManifest = {
      name: "BadName",
      description: "x",
      license: "MIT",
      metadata: {
        author: "x",
        version: "0",
        agent: { impl: "./x" },
      },
    };
    expect(() => reg.loadManifests([bad])).toThrowError(/INVALID_SKILL_NAME/);
  });

  it("OKX skill 名 (okx- 前缀) 豁免命名校验", () => {
    const okx: SkillManifest = {
      name: "okx-defi-invest",
      description: "stub",
      license: "MIT",
      metadata: {
        author: "okx",
        version: "3.0.0",
        agent: { impl: "<rust-cli>" },
      },
    };
    expect(() => reg.loadManifests([okx])).not.toThrow();
    expect(reg.list().map((e) => e.name)).toContain("okx-defi-invest");
  });

  it("toAnthropicTools 返回 name/description/input_schema 三元组", () => {
    reg.loadManifests();
    const tools = reg.toAnthropicTools();
    expect(tools).toHaveLength(5);
    for (const t of tools) {
      expect(t.name).toMatch(/^h\.v2\.strategy\./);
      expect(t.description.length).toBeGreaterThan(50);
      expect(t.input_schema).toBeTypeOf("object");
    }
  });

  it("dispatch 未注册 impl 时返回 NOT_IMPLEMENTED 而不抛错", async () => {
    reg.loadManifests();
    const { ctx } = makeMockCtx();
    const r = await reg.dispatch("h.v2.strategy.dca", {}, ctx);
    expect(r.code).toBe("NOT_IMPLEMENTED");
  });

  it("dispatch 未知 skill 名时返回 ERROR", async () => {
    reg.loadManifests();
    const { ctx } = makeMockCtx();
    const r = await reg.dispatch("h.v2.strategy.no_such_thing", {}, ctx);
    expect(r.code).toBe("ERROR");
  });

  it("registerImpl 后 dispatch 真正调到 impl", async () => {
    reg.loadManifests();
    const fakeImpl: SkillImpl = async () => ({ code: "OK", data: { hello: "world" } });
    reg.registerImpl("h.v2.strategy.dca", fakeImpl);

    const { ctx } = makeMockCtx();
    const r = await reg.dispatch("h.v2.strategy.dca", {}, ctx);
    expect(r.code).toBe("OK");
    if (r.code === "OK") {
      expect(r.data).toEqual({ hello: "world" });
    }
  });

  it("registerImpl 重复注册同 skill 时抛错", () => {
    reg.loadManifests();
    const noop: SkillImpl = async () => ({ code: "OK", data: null });
    reg.registerImpl("h.v2.strategy.dca", noop);
    expect(() => reg.registerImpl("h.v2.strategy.dca", noop)).toThrowError(/DUPLICATE_IMPL/);
  });

  it("registerImpl 未加载 manifest 的 skill 抛错", () => {
    reg.loadManifests();
    const noop: SkillImpl = async () => ({ code: "OK", data: null });
    expect(() => reg.registerImpl("h.v2.strategy.unknown", noop)).toThrowError(/UNKNOWN_SKILL/);
  });

  it("dispatch impl 内抛异常时被捕获返回 ERROR", async () => {
    reg.loadManifests();
    const boom: SkillImpl = async () => {
      throw new Error("boom");
    };
    reg.registerImpl("h.v2.strategy.dca", boom);

    const { ctx } = makeMockCtx();
    const r = await reg.dispatch("h.v2.strategy.dca", {}, ctx);
    expect(r.code).toBe("ERROR");
    if (r.code === "ERROR") {
      expect(r.message).toContain("boom");
    }
  });

  it("manifest 5 条全部带 mvpType 1-5", () => {
    const types = ALL_H_SKILL_MANIFESTS.map((m) => m.metadata.agent.mvpType).sort();
    expect(types).toEqual([1, 2, 3, 4, 5]);
  });

  it("getManifest 拿到指定 skill 的 description", () => {
    reg.loadManifests();
    const m = reg.getManifest("h.v2.strategy.stable_yield");
    expect(m).toBeDefined();
    expect(m?.description).toMatch(/稳定收益/);
  });
});
