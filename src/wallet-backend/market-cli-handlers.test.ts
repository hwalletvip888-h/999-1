import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./onchainos-cli", () => ({
  isOnchainosCliAvailable: vi.fn(() => true),
  runOnchainosJson: vi.fn(),
}));

import * as onchainCli from "./onchainos-cli";
import {
  handleDexHotTokens,
  handleDexSignalList,
  handleDexTrackerActivities,
  handleDefiDiscover,
} from "./market-cli-handlers";

describe("market-cli-handlers", () => {
  beforeEach(() => {
    vi.mocked(onchainCli.runOnchainosJson).mockReset();
    vi.mocked(onchainCli.isOnchainosCliAvailable).mockReturnValue(true);
  });

  it("handleDexSignalList maps data[] + wallet_type", () => {
    vi.mocked(onchainCli.runOnchainosJson).mockReturnValue({
      ok: true,
      data: [
        {
          tokenSymbol: "pepe",
          chainIndex: 1,
          wallet_type: 2,
          priceUsd: "0.001",
          change24h: "+12%",
          marketCapUsd: "1M",
          cursor: "c1",
        },
      ],
    });
    const out = handleDexSignalList(undefined, { chain: "ethereum" }) as Array<{ signalType: string; symbol: string }>;
    expect(out).toHaveLength(1);
    expect(out[0].signalType).toBe("kol_call");
    expect(out[0].symbol).toBe("PEPE");
    expect(vi.mocked(onchainCli.runOnchainosJson).mock.calls[0][0]).toContain("signal");
    expect(vi.mocked(onchainCli.runOnchainosJson).mock.calls[0][0]).toContain("list");
  });

  it("handleDexHotTokens maps list wrapper", () => {
    vi.mocked(onchainCli.runOnchainosJson).mockReturnValue({
      list: [{ symbol: "WIF", chainName: "solana", changePct24h: "5%" }],
    });
    const out = handleDexHotTokens(undefined, { limit: 10 }) as Array<{ symbol: string; chain: string }>;
    expect(out[0].symbol).toBe("WIF");
    expect(out[0].chain).toBe("solana");
  });

  it("handleDexTrackerActivities uses smart_money by default", () => {
    vi.mocked(onchainCli.runOnchainosJson).mockReturnValue({
      activities: [
        {
          symbol: "DOGE",
          chainIndex: 1,
          side: "buy",
          amountUsd: "1200",
          txHash: "0xabc",
        },
      ],
    });
    const out = handleDexTrackerActivities(undefined, {}) as Array<{ trackerType: string; symbol: string }>;
    expect(out[0].trackerType).toBe("smart_money");
    expect(out[0].symbol).toBe("DOGE");
    const args = vi.mocked(onchainCli.runOnchainosJson).mock.calls[0][0] as string[];
    expect(args).toContain("smart_money");
  });

  it("handleDefiDiscover falls back to hot when defi search empty", () => {
    vi.mocked(onchainCli.runOnchainosJson)
      .mockReturnValueOnce({ ok: true, data: [] })
      .mockReturnValueOnce({
        data: [{ tokenSymbol: "AAVE", chainIndex: 1, changePct24h: "1.2", marketCapUsd: "2B" }],
      });
    const out = handleDefiDiscover(undefined, { chain: "ethereum" }) as Array<{ protocol: string; asset: string }>;
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].protocol).toBe("热门榜");
    expect(String(out[0].asset)).toMatch(/AAVE/i);
  });

  it("returns [] when CLI unavailable", () => {
    vi.mocked(onchainCli.isOnchainosCliAvailable).mockReturnValue(false);
    expect(handleDexSignalList(undefined, {})).toEqual([]);
  });
});
