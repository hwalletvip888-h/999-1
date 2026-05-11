import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/claudeAI", () => ({
  askClaude: vi.fn().mockResolvedValue({ action: "chat", reply: "mock" }),
}));

import { normalizeUserUtterance } from "./normalizeUtterance";
import { parseUserIntent } from "./parseUserIntent";
import { askClaude } from "../core/claudeAI";

describe("normalizeUserUtterance", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeUserUtterance("  充值   地址  ")).toBe("充值 地址");
  });
});

describe("parseUserIntent", () => {
  beforeEach(() => {
    vi.mocked(askClaude).mockClear();
  });

  it("short-circuits on local non-chat", async () => {
    const r = await parseUserIntent("我要充值地址");
    expect(r.source).toBe("local_rule");
    expect(r.intent.action).toBe("address");
    expect(r.stages).toEqual(["normalize", "local_rule"]);
    expect(r.utterance).toBe("我要充值地址");
    expect(askClaude).not.toHaveBeenCalled();
  });

  it("calls LLM when local is chat", async () => {
    const r = await parseUserIntent("今天天气如何");
    expect(r.source).toBe("remote_llm");
    expect(r.stages).toEqual(["normalize", "local_rule", "llm_remote"]);
    expect(askClaude).toHaveBeenCalledOnce();
    expect(r.intent.action).toBe("chat");
  });
});
