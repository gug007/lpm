import { describe, expect, it } from "vitest";
import {
  limitStopDetail,
  limitStopHeadline,
  limitStopHolds,
  limitStopReset,
  type LimitStop,
} from "./claudeLimitStop";

const NOW = 1_800_000_000_000;
const AT = NOW / 1000;

const weekly: LimitStop = {
  kind: "limit",
  account: "default",
  accountLabel: "Main login",
  window: "weekly",
  resetsAt: AT + 62 * 3600,
  offer: { account: "acct-2", label: "Claude 2", fiveHour: 18, weekly: 41, near: false },
};

describe("limit stop wording", () => {
  it("names the account, the limit and when it resets", () => {
    expect(limitStopHeadline(weekly)).toBe("Main login hit its weekly limit");
    expect(limitStopHeadline({ ...weekly, window: "fiveHour" })).toBe("Main login hit its 5-hour limit");
    expect(limitStopReset(weekly, NOW)).toBe("resets in 2d 14h");
  });

  it("names the account with room and its usage", () => {
    expect(limitStopDetail(weekly, NOW)).toBe("Claude 2 has room · 5-hour 18% · weekly 41%");
    const near = { ...weekly, offer: { ...weekly.offer!, fiveHour: 93, weekly: undefined, near: true } };
    expect(limitStopDetail(near, NOW)).toBe("Claude 2 has the most room · 5-hour 93%");
  });

  it("says which account frees up first when none has room", () => {
    const full = { ...weekly, offer: undefined, firstFree: { account: "acct-2", label: "Claude 2", resetsAt: AT + 80 * 60 } };
    expect(limitStopDetail(full, NOW)).toBe("Every account is at a limit. Claude 2 resets first, in 1h 20m.");
    expect(limitStopDetail({ ...weekly, offer: undefined }, NOW)).toBe("No other account in your list has room.");
  });

  it("points a hold to settings and a model limit to /model", () => {
    const hold: LimitStop = { kind: "hold", account: "default", accountLabel: "Main login", resetsAt: 0 };
    expect(limitStopHeadline(hold)).toBe("Main login was put on hold");
    expect(limitStopReset(hold, NOW)).toBe("");
    expect(limitStopDetail(hold, NOW)).toMatch(/^Account switching is paused\./);
    const opus: LimitStop = { ...hold, kind: "model", model: "Opus", resetsAt: AT + 3 * 86400 };
    expect(limitStopHeadline(opus)).toBe("Main login hit its weekly Opus limit");
    expect(limitStopDetail(opus, NOW)).toBe("This account still works with other models. Type /model to switch.");
  });

  it("is over once the limit resets", () => {
    expect(limitStopHolds(weekly, NOW)).toBe(true);
    expect(limitStopHolds({ ...weekly, resetsAt: AT - 1 }, NOW)).toBe(false);
    expect(limitStopHolds({ ...weekly, kind: "hold", resetsAt: 0 }, NOW)).toBe(true);
  });
});
