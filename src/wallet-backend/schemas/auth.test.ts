import { describe, expect, it } from "vitest";
import { parseAuthSendOtpBody, parseAuthVerifyOtpBody } from "./auth";

describe("parseAuthSendOtpBody", () => {
  it("accepts valid email", () => {
    const r = parseAuthSendOtpBody({ email: "a@b.co" });
    expect(r.ok).toBe(true);
  });

  it("rejects invalid email", () => {
    const r = parseAuthSendOtpBody({ email: "not-an-email" });
    expect(r.ok).toBe(false);
  });
});

describe("parseAuthVerifyOtpBody", () => {
  it("accepts 6-digit code", () => {
    const r = parseAuthVerifyOtpBody({ email: "a@b.co", code: "123456" });
    expect(r.ok).toBe(true);
  });

  it("rejects bad code", () => {
    const r = parseAuthVerifyOtpBody({ email: "a@b.co", code: "12345" });
    expect(r.ok).toBe(false);
  });
});
