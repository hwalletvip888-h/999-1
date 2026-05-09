import { describe, expect, it } from "vitest";
import { mergeUserSignalWithTimeout } from "./mergeUserSignalWithTimeout";
import { FETCH_TIMEOUT_MS } from "./hwalletHttpConstants";

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

describe("FETCH_TIMEOUT_MS", () => {
  it("is a positive duration", () => {
    expect(FETCH_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
