import { describe, expect, it, vi } from "vitest";
import { isRetriableHttpStatus, withHttpRetries } from "./walletHttpRetry";

describe("isRetriableHttpStatus", () => {
  it("marks transient statuses", () => {
    expect(isRetriableHttpStatus(429)).toBe(true);
    expect(isRetriableHttpStatus(503)).toBe(true);
    expect(isRetriableHttpStatus(400)).toBe(false);
    expect(isRetriableHttpStatus(200)).toBe(false);
  });
});

describe("withHttpRetries", () => {
  it("returns first successful response without retrying", async () => {
    const fn = vi.fn().mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const res = await withHttpRetries(fn, { method: "GET", maxRetries: 2 });
    expect(res.ok).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries GET on 503 then succeeds", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const res = await withHttpRetries(fn, { method: "GET", maxRetries: 2, baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry POST on 503", async () => {
    const fn = vi.fn().mockResolvedValue(new Response("bad", { status: 503 }));
    const res = await withHttpRetries(fn, { method: "POST", maxRetries: 2 });
    expect(res.status).toBe(503);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
