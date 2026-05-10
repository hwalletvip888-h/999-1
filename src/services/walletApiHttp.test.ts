import { describe, expect, it } from "vitest";
import { mergeUserSignalWithTimeout } from "./mergeUserSignalWithTimeout";
import { FETCH_TIMEOUT_MS, EXTERNAL_LLM_FETCH_TIMEOUT_MS } from "./hwalletHttpConstants";

describe("mergeUserSignalWithTimeout", () => {
  it("returns timeout signal when user signal is absent", () => {
    const timeout = new AbortController();
    const merged = mergeUserSignalWithTimeout(undefined, timeout.signal);
    expect(merged.aborted).toBe(false);
    timeout.abort();
    expect(merged.aborted).toBe(true);
  });

  it("aborts merged when user aborts", () => {
    const user = new AbortController();
    const timeout = new AbortController();
    const merged = mergeUserSignalWithTimeout(user.signal, timeout.signal);
    user.abort("bye");
    expect(merged.aborted).toBe(true);
  });

  it("aborts merged when timeout aborts", () => {
    const user = new AbortController();
    const timeout = new AbortController();
    const merged = mergeUserSignalWithTimeout(user.signal, timeout.signal);
    timeout.abort();
    expect(merged.aborted).toBe(true);
  });

  it("returns immediately aborted when user already aborted", () => {
    const user = new AbortController();
    user.abort();
    const timeout = new AbortController();
    const merged = mergeUserSignalWithTimeout(user.signal, timeout.signal);
    expect(merged.aborted).toBe(true);
  });
});

describe("EXTERNAL_LLM_FETCH_TIMEOUT_MS", () => {
  it("defaults within 30s–300s clamp", () => {
    expect(EXTERNAL_LLM_FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
    expect(EXTERNAL_LLM_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(300_000);
  });
});

describe("FETCH_TIMEOUT_MS", () => {
  it("is a positive duration", () => {
    expect(FETCH_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
