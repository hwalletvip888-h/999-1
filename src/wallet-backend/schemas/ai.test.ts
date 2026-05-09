import { describe, expect, it } from "vitest";
import { parseAiChatBody, parseAiIntentBody } from "./ai";

describe("parseAiChatBody", () => {
  it("accepts minimal valid body", () => {
    const r = parseAiChatBody({ message: "hello" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.message).toBe("hello");
  });

  it("accepts messages + message", () => {
    const r = parseAiChatBody({
      messages: [{ role: "user", content: "a" }],
      message: "b",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects empty message", () => {
    const r = parseAiChatBody({ message: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects bad role", () => {
    const r = parseAiChatBody({
      messages: [{ role: "nope", content: "x" } as any],
      message: "hi",
    });
    expect(r.ok).toBe(false);
  });
});

describe("parseAiIntentBody", () => {
  it("accepts message", () => {
    const r = parseAiIntentBody({ message: "swap eth" });
    expect(r.ok).toBe(true);
  });

  it("rejects missing message", () => {
    const r = parseAiIntentBody({});
    expect(r.ok).toBe(false);
  });
});
