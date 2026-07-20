import { describe, expect, it } from "vitest";
import type { LimitWindow } from "../../hooks/useAgentLimits";
import {
  FIVE_HOUR_MS,
  WEEKLY_MS,
  asOfText,
  computePace,
  durationShort,
  paceLabel,
  providerMeta,
  resetDurationShort,
  resetText,
  updatedText,
} from "./limitsFormat";

const NOW = 1_700_000_000_000;
const NOW_SECONDS = NOW / 1000;
const HOUR_MS = 60 * 60 * 1000;

// resetsAt travels the wire as unix SECONDS while `now` is unix MILLIS; every
// fixture is built through this seam so a unit mixup can't hide behind a helper.
function resettingIn(ms: number, usedPercent: number): LimitWindow {
  return { usedPercent, resetsAt: Math.round((NOW + ms) / 1000) };
}

describe("computePace seconds-vs-millis contract", () => {
  it("reads resetsAt as unix seconds against a millis now", () => {
    const win: LimitWindow = { usedPercent: 50, resetsAt: NOW_SECONDS + 9_000 };
    const pace = computePace(win, FIVE_HOUR_MS, NOW)!;

    expect(pace.expired).toBe(false);
    expect(pace.elapsedPercent).toBe(50);
    expect(pace.verdict).toBe("on");
  });

  it("treats a resetsAt handed over in millis as an absurd far-future reset", () => {
    const wrongUnits: LimitWindow = { usedPercent: 50, resetsAt: NOW + FIVE_HOUR_MS };
    const pace = computePace(wrongUnits, FIVE_HOUR_MS, NOW)!;

    expect(pace.elapsedPercent).toBe(0);
    expect(pace.verdict).toBe("early");
  });

  it("keeps the same seconds contract in resetText and resetDurationShort", () => {
    expect(resetText(NOW_SECONDS + 9_000, NOW)).toBe("resets in 2h 30m");
    expect(resetDurationShort(NOW_SECONDS + 9_000, NOW)).toBe("2h 30m");
  });
});

describe("computePace guards", () => {
  it("returns null without a window", () => {
    expect(computePace(undefined, FIVE_HOUR_MS, NOW)).toBeNull();
  });

  it("returns null when the reset time is unknown", () => {
    expect(computePace({ usedPercent: 40, resetsAt: 0 }, FIVE_HOUR_MS, NOW)).toBeNull();
  });

  it("returns null for an unusable window length", () => {
    const win = resettingIn(FIVE_HOUR_MS / 2, 40);
    expect(computePace(win, 0, NOW)).toBeNull();
    expect(computePace(win, -FIVE_HOUR_MS, NOW)).toBeNull();
    expect(computePace(win, Number.NaN, NOW)).toBeNull();
  });
});

describe("computePace expiry", () => {
  it("is not expired while the reset is in the future", () => {
    expect(computePace(resettingIn(1_000, 40), FIVE_HOUR_MS, NOW)!.expired).toBe(false);
  });

  it("is expired at the exact reset instant", () => {
    const win: LimitWindow = { usedPercent: 40, resetsAt: NOW_SECONDS };
    expect(computePace(win, FIVE_HOUR_MS, NOW)!.expired).toBe(true);
  });

  it("is expired once the reset has passed", () => {
    expect(computePace(resettingIn(-60_000, 40), FIVE_HOUR_MS, NOW)!.expired).toBe(true);
  });
});

describe("computePace elapsedPercent", () => {
  it("is 0 at the window start", () => {
    expect(computePace(resettingIn(FIVE_HOUR_MS, 0), FIVE_HOUR_MS, NOW)!.elapsedPercent).toBe(0);
  });

  it("is 50 at the midpoint", () => {
    expect(computePace(resettingIn(FIVE_HOUR_MS / 2, 0), FIVE_HOUR_MS, NOW)!.elapsedPercent).toBe(50);
  });

  it("is 100 at the window end", () => {
    expect(computePace(resettingIn(0, 0), FIVE_HOUR_MS, NOW)!.elapsedPercent).toBe(100);
  });

  it("clamps to 0 when the reset is further out than the window length", () => {
    expect(computePace(resettingIn(6 * HOUR_MS, 40), FIVE_HOUR_MS, NOW)!.elapsedPercent).toBe(0);
    expect(computePace(resettingIn(10 * 24 * HOUR_MS, 40), WEEKLY_MS, NOW)!.elapsedPercent).toBe(0);
  });

  it("clamps to 100 for a reset far in the past", () => {
    expect(computePace(resettingIn(-100 * WEEKLY_MS, 40), FIVE_HOUR_MS, NOW)!.elapsedPercent).toBe(
      100,
    );
  });
});

describe("computePace verdicts", () => {
  it("is early below 5% elapsed even when badly over pace", () => {
    const pace = computePace(resettingIn(FIVE_HOUR_MS - 899_000, 20), FIVE_HOUR_MS, NOW)!;
    expect(pace.elapsedPercent).toBeLessThan(5);
    expect(pace.verdict).toBe("early");
  });

  it("judges pace from exactly 5% elapsed", () => {
    const pace = computePace(resettingIn(FIVE_HOUR_MS - 900_000, 20), FIVE_HOUR_MS, NOW)!;
    expect(pace.elapsedPercent).toBe(5);
    expect(pace.verdict).toBe("over");
  });

  it("is exhausted at exactly 100% used", () => {
    expect(computePace(resettingIn(FIVE_HOUR_MS / 2, 100), FIVE_HOUR_MS, NOW)!.verdict).toBe(
      "exhausted",
    );
  });

  it("is exhausted above 100% used", () => {
    expect(computePace(resettingIn(FIVE_HOUR_MS / 2, 127), FIVE_HOUR_MS, NOW)!.verdict).toBe(
      "exhausted",
    );
  });

  it("prefers exhausted over early", () => {
    expect(computePace(resettingIn(FIVE_HOUR_MS - 180_000, 100), FIVE_HOUR_MS, NOW)!.verdict).toBe(
      "exhausted",
    );
  });

  it("keeps the 1.15 ratio boundary itself on pace", () => {
    const pace = computePace(resettingIn(FIVE_HOUR_MS / 2, 57.5), FIVE_HOUR_MS, NOW)!;
    expect(pace.ratio).toBe(1.15);
    expect(pace.verdict).toBe("on");
  });

  it("is over just past the 1.15 ratio boundary", () => {
    const pace = computePace(resettingIn(FIVE_HOUR_MS / 2, 57.6), FIVE_HOUR_MS, NOW)!;
    expect(pace.ratio).toBeGreaterThan(1.15);
    expect(pace.verdict).toBe("over");
  });

  it("keeps the 0.85 ratio boundary itself on pace", () => {
    const pace = computePace(resettingIn(FIVE_HOUR_MS / 2, 42.5), FIVE_HOUR_MS, NOW)!;
    expect(pace.ratio).toBe(0.85);
    expect(pace.verdict).toBe("on");
  });

  it("is under just below the 0.85 ratio boundary", () => {
    const pace = computePace(resettingIn(FIVE_HOUR_MS / 2, 42.4), FIVE_HOUR_MS, NOW)!;
    expect(pace.ratio).toBeLessThan(0.85);
    expect(pace.verdict).toBe("under");
  });

  it("applies the same ratio boundaries to the weekly window", () => {
    expect(computePace(resettingIn(WEEKLY_MS / 2, 57.5), WEEKLY_MS, NOW)!.verdict).toBe("on");
    expect(computePace(resettingIn(WEEKLY_MS / 2, 57.6), WEEKLY_MS, NOW)!.verdict).toBe("over");
    expect(computePace(resettingIn(WEEKLY_MS / 2, 42.5), WEEKLY_MS, NOW)!.verdict).toBe("on");
    expect(computePace(resettingIn(WEEKLY_MS / 2, 42.4), WEEKLY_MS, NOW)!.verdict).toBe("under");
  });

  it("is unknown for a non-finite percentage", () => {
    for (const usedPercent of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const pace = computePace(resettingIn(FIVE_HOUR_MS / 2, usedPercent), FIVE_HOUR_MS, NOW)!;
      expect(pace.verdict).toBe("unknown");
      expect(pace.exhaustsInMs).toBeNull();
      expect(Number.isFinite(pace.ratio)).toBe(true);
      expect(Number.isFinite(pace.elapsedPercent)).toBe(true);
    }
  });
});

describe("computePace exhaustsInMs", () => {
  it("projects the burnout from the current burn rate", () => {
    const pace = computePace(resettingIn(FIVE_HOUR_MS * 0.75, 50), FIVE_HOUR_MS, NOW)!;
    expect(pace.elapsedPercent).toBe(25);
    expect(pace.exhaustsInMs).toBe(4_500_000);
    expect(durationShort(pace.exhaustsInMs!)).toBe("1h 15m");
  });

  it("projects a weekly burnout in the same terms", () => {
    const pace = computePace(resettingIn(WEEKLY_MS / 2, 80), WEEKLY_MS, NOW)!;
    expect(pace.exhaustsInMs).toBe(75_600_000);
    expect(durationShort(pace.exhaustsInMs!)).toBe("21h");
  });

  it("is null when the projection lands exactly on the reset", () => {
    expect(computePace(resettingIn(FIVE_HOUR_MS / 2, 50), FIVE_HOUR_MS, NOW)!.exhaustsInMs).toBeNull();
  });

  it("is null when the projection lands after the reset", () => {
    expect(computePace(resettingIn(FIVE_HOUR_MS / 2, 10), FIVE_HOUR_MS, NOW)!.exhaustsInMs).toBeNull();
    expect(computePace(resettingIn(WEEKLY_MS / 2, 20), WEEKLY_MS, NOW)!.exhaustsInMs).toBeNull();
  });

  it("is null without a burn rate", () => {
    expect(computePace(resettingIn(FIVE_HOUR_MS / 2, 0), FIVE_HOUR_MS, NOW)!.exhaustsInMs).toBeNull();
    expect(computePace(resettingIn(FIVE_HOUR_MS, 40), FIVE_HOUR_MS, NOW)!.exhaustsInMs).toBeNull();
  });

  it("is null once the limit is already reached", () => {
    expect(computePace(resettingIn(FIVE_HOUR_MS / 2, 100), FIVE_HOUR_MS, NOW)!.exhaustsInMs).toBeNull();
  });
});

describe("computePace numeric safety", () => {
  const percents = [0, 0.0001, 4.9, 42.5, 99.999, 100, 100.0001, 1_000, -5];
  const offsets = [
    -100 * WEEKLY_MS,
    -1,
    0,
    1,
    60_000,
    FIVE_HOUR_MS / 2,
    FIVE_HOUR_MS,
    100 * WEEKLY_MS,
  ];

  it("never emits NaN or Infinity for any plausible input", () => {
    for (const windowMs of [FIVE_HOUR_MS, WEEKLY_MS]) {
      for (const usedPercent of percents) {
        for (const offset of offsets) {
          const pace = computePace(resettingIn(offset, usedPercent), windowMs, NOW);
          if (!pace) continue;
          const where = `${windowMs}/${usedPercent}/${offset}`;

          expect(Number.isFinite(pace.elapsedPercent), where).toBe(true);
          expect(Number.isFinite(pace.ratio), where).toBe(true);
          expect(pace.elapsedPercent, where).toBeGreaterThanOrEqual(0);
          expect(pace.elapsedPercent, where).toBeLessThanOrEqual(100);
          expect(pace.exhaustsInMs === null || Number.isFinite(pace.exhaustsInMs), where).toBe(true);
          if (pace.exhaustsInMs !== null) expect(pace.exhaustsInMs, where).toBeGreaterThan(0);
        }
      }
    }
  });

  it("stays finite when nothing has been used and nothing has elapsed", () => {
    const pace = computePace(resettingIn(FIVE_HOUR_MS, 0), FIVE_HOUR_MS, NOW)!;
    expect(pace.elapsedPercent).toBe(0);
    expect(pace.ratio).toBe(0);
    expect(pace.verdict).toBe("early");
    expect(pace.exhaustsInMs).toBeNull();
  });
});

describe("paceLabel", () => {
  it("phrases each judged verdict", () => {
    expect(paceLabel(computePace(resettingIn(FIVE_HOUR_MS / 2, 90), FIVE_HOUR_MS, NOW))).toBe(
      "ahead of pace",
    );
    expect(paceLabel(computePace(resettingIn(FIVE_HOUR_MS / 2, 50), FIVE_HOUR_MS, NOW))).toBe(
      "on pace",
    );
    expect(paceLabel(computePace(resettingIn(FIVE_HOUR_MS / 2, 10), FIVE_HOUR_MS, NOW))).toBe(
      "under pace",
    );
    expect(paceLabel(computePace(resettingIn(FIVE_HOUR_MS / 2, 100), FIVE_HOUR_MS, NOW))).toBe(
      "limit reached",
    );
  });

  it("stays silent when there is nothing to judge", () => {
    expect(paceLabel(computePace(resettingIn(FIVE_HOUR_MS, 1), FIVE_HOUR_MS, NOW))).toBe("");
    expect(paceLabel(null)).toBe("");
  });
});

describe("durationShort", () => {
  it("formats coarse buckets", () => {
    expect(durationShort(90_000)).toBe("2m");
    expect(durationShort(2 * HOUR_MS + 600_000)).toBe("2h 10m");
    expect(durationShort(3 * HOUR_MS)).toBe("3h");
    expect(durationShort(50 * HOUR_MS)).toBe("2d 2h");
    expect(durationShort(3 * 24 * HOUR_MS)).toBe("3d");
    expect(durationShort(WEEKLY_MS)).toBe("7d");
  });

  it("floors sub-minute spans at a minute", () => {
    expect(durationShort(20_000)).toBe("1m");
    expect(durationShort(1)).toBe("1m");
  });

  it("collapses non-positive and non-finite spans", () => {
    expect(durationShort(0)).toBe("now");
    expect(durationShort(-1)).toBe("now");
    expect(durationShort(Number.NaN)).toBe("now");
    expect(durationShort(Number.POSITIVE_INFINITY)).toBe("now");
  });
});

describe("resetText", () => {
  it("is empty when the reset time is unknown", () => {
    expect(resetText(0, NOW)).toBe("");
  });

  it("reads as now at and past the reset instant", () => {
    expect(resetText(NOW_SECONDS, NOW)).toBe("resets now");
    expect(resetText(NOW_SECONDS - 3_600, NOW)).toBe("resets now");
  });

  it("floors a still-future window at one minute rather than 0m", () => {
    expect(resetText(NOW_SECONDS + 30, NOW)).toBe("resets in 1m");
    expect(resetText(NOW_SECONDS + 20, NOW)).toBe("resets in 1m");
  });

  it("scales through minutes, hours and days", () => {
    expect(resetText(NOW_SECONDS + 59 * 60, NOW)).toBe("resets in 59m");
    expect(resetText(NOW_SECONDS + 2 * 3_600, NOW)).toBe("resets in 2h");
    expect(resetText(NOW_SECONDS + 2 * 3_600 + 1_800, NOW)).toBe("resets in 2h 30m");
    expect(resetText(NOW_SECONDS + 3 * 24 * 3_600, NOW)).toBe("resets in 3d");
    expect(resetText(NOW_SECONDS + 50 * 3_600, NOW)).toBe("resets in 2d 2h");
  });
});

describe("resetDurationShort", () => {
  it("is empty when the reset time is unknown", () => {
    expect(resetDurationShort(0, NOW)).toBe("");
  });

  it("reads as now at and past the reset instant", () => {
    expect(resetDurationShort(NOW_SECONDS, NOW)).toBe("now");
    expect(resetDurationShort(NOW_SECONDS - 1, NOW)).toBe("now");
  });

  it("floors a still-future window at one minute rather than 0m", () => {
    expect(resetDurationShort(NOW_SECONDS + 30, NOW)).toBe("1m");
    expect(resetDurationShort(NOW_SECONDS + 20, NOW)).toBe("1m");
  });

  it("scales through minutes, hours and days", () => {
    expect(resetDurationShort(NOW_SECONDS + 12 * 60, NOW)).toBe("12m");
    expect(resetDurationShort(NOW_SECONDS + 3 * 3_600 + 1_260, NOW)).toBe("3h 21m");
    expect(resetDurationShort(NOW_SECONDS + 4 * 24 * 3_600 + 3 * 3_600, NOW)).toBe("4d 3h");
  });
});

describe("updatedText", () => {
  it("collapses the last minute", () => {
    expect(updatedText(NOW, NOW)).toBe("updated just now");
    expect(updatedText(NOW - 20_000, NOW)).toBe("updated just now");
  });

  it("scales through minutes, hours and days", () => {
    expect(updatedText(NOW - 2 * 60_000, NOW)).toBe("updated 2m ago");
    expect(updatedText(NOW - 90 * 60_000, NOW)).toBe("updated 2h ago");
    expect(updatedText(NOW - 25 * HOUR_MS, NOW)).toBe("updated 1d ago");
  });
});

describe("asOfText", () => {
  it("keeps its own phrasing for the sidebar row", () => {
    expect(asOfText(NOW, NOW)).toBe("as of just now");
    expect(asOfText(NOW - 5 * 60_000, NOW)).toBe("as of 5m ago");
    expect(asOfText(NOW - 3 * HOUR_MS, NOW)).toBe("as of 3h ago");
  });
});

describe("providerMeta", () => {
  it("uses the Stats page provider colors", () => {
    expect(providerMeta("claude")).toEqual({ label: "Claude", dot: "#D97757" });
    expect(providerMeta("codex")).toEqual({ label: "Codex", dot: "#10A37F" });
  });

  it("falls back for an unknown provider", () => {
    expect(providerMeta("gemini")).toEqual({ label: "gemini", dot: "var(--text-muted)" });
  });
});
