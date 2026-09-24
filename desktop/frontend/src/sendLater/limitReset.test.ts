import { describe, expect, it } from "vitest";
import { limitResetFor, limitsEntryFor } from "./limitReset";
import type { ProviderLimits } from "../hooks/useAgentLimits";

const NOW = 1_800_000_000_000;
const secs = (ms: number) => Math.floor(ms / 1000);

const claude = (over: Partial<ProviderLimits>): ProviderLimits => ({
  provider: "claude",
  accountId: "work",
  updatedAt: NOW,
  ...over,
});

describe("limitsEntryFor", () => {
  it("finds the reading for this terminal's account", () => {
    const work = claude({ accountId: "work" });
    const other = claude({ accountId: "home" });
    expect(limitsEntryFor({ "claude:work": work, "claude:home": other }, "claude", "work")).toBe(work);
    expect(limitsEntryFor({ codex: other }, "codex", "work")).toBe(other);
    expect(limitsEntryFor({ "claude:home": other }, "claude", "work")).toBeUndefined();
  });
});

describe("limitResetFor", () => {
  it("uses the 5-hour window, going out just after it resets", () => {
    const resetsAt = secs(NOW + 3 * 3600_000);
    const r = limitResetFor(claude({ fiveHour: { usedPercent: 92, resetsAt } }), "claude", NOW);
    expect(r?.resetsAt).toBe(resetsAt * 1000);
    expect(r?.at).toBeGreaterThan(resetsAt * 1000);
    expect(r).toMatchObject({ usedPercent: 92, agent: "Claude", window: "5-hour" });
  });

  it("follows a used-up weekly window over the 5-hour one", () => {
    const entry = claude({
      fiveHour: { usedPercent: 40, resetsAt: secs(NOW + 3600_000) },
      weekly: { usedPercent: 100, resetsAt: secs(NOW + 48 * 3600_000) },
    });
    expect(limitResetFor(entry, "claude", NOW)?.window).toBe("weekly");
  });

  it("offers nothing without a live reading", () => {
    expect(limitResetFor(undefined, "claude", NOW)).toBeNull();
    expect(limitResetFor(claude({ noLimits: true }), "claude", NOW)).toBeNull();
    expect(
      limitResetFor(claude({ fiveHour: { usedPercent: 50, resetsAt: secs(NOW - 1000) } }), "claude", NOW),
    ).toBeNull();
    expect(limitResetFor(claude({ fiveHour: { usedPercent: 50, resetsAt: 0 } }), "claude", NOW)).toBeNull();
  });
});
