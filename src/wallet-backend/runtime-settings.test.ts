import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyRuntimeSettingsPatch,
  getEffectiveAiRateLimitMax,
  invalidateRuntimeSettingsCache,
} from "./runtime-settings";
import { AI_RATE_LIMIT_MAX } from "./config";

describe("runtime-settings", () => {
  let tmp: string;
  let prevHome: string | undefined;
  let prevCli: string | undefined;
  let prevRs: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hw-rs-"));
    prevHome = process.env.HOME;
    prevCli = process.env.HWALLET_CLI_HOME_ROOT;
    prevRs = process.env.HWALLET_RUNTIME_SETTINGS_PATH;
    process.env.HOME = tmp;
    process.env.HWALLET_CLI_HOME_ROOT = path.join(tmp, "cli");
    process.env.HWALLET_RUNTIME_SETTINGS_PATH = path.join(tmp, "runtime-settings.json");
    fs.mkdirSync(process.env.HWALLET_CLI_HOME_ROOT, { recursive: true });
    invalidateRuntimeSettingsCache();
  });

  afterEach(() => {
    process.env.HOME = prevHome;
    process.env.HWALLET_CLI_HOME_ROOT = prevCli;
    process.env.HWALLET_RUNTIME_SETTINGS_PATH = prevRs;
    invalidateRuntimeSettingsCache();
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("applies aiRateLimitMax override and clears with null", () => {
    const base = AI_RATE_LIMIT_MAX;
    expect(getEffectiveAiRateLimitMax()).toBe(base);

    const a = applyRuntimeSettingsPatch({ aiRateLimitMax: 7 });
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.payload.effective.aiRateLimitMax).toBe(7);
    expect(getEffectiveAiRateLimitMax()).toBe(7);

    const b = applyRuntimeSettingsPatch({ aiRateLimitMax: null });
    expect(b.ok).toBe(true);
    expect(getEffectiveAiRateLimitMax()).toBe(base);
  });

  it("rejects out-of-range aiRateLimitMax", () => {
    const r = applyRuntimeSettingsPatch({ aiRateLimitMax: 200_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("aiRateLimitMax");
  });
});
