import { describe, expect, it } from "vitest";
import { tryLocalChatReply } from "./localChatReply";

describe("tryLocalChatReply", () => {
  it("hits help before needing LLM", () => {
    expect(tryLocalChatReply("  帮助  ")).toContain("怎么用 H");
    expect(tryLocalChatReply("怎么用")).toContain("怎么用 H");
  });

  it("hits greeting", () => {
    expect(tryLocalChatReply("你好")).toContain("链上 AI 管家");
  });

  it("returns null for substantive chat", () => {
    expect(tryLocalChatReply("分析一下 ETH 下周走势")).toBeNull();
    expect(tryLocalChatReply("帮我写一段 Solidity")).toBeNull();
  });

  it("does not steal portfolio intent phrasing", () => {
    expect(tryLocalChatReply("总资产多少")).toBeNull();
  });
});
