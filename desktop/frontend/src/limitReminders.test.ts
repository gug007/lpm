import { describe, expect, it } from "vitest";
import { reminderFor, remindable, REMIND_FROM_PERCENT, type LimitReminder } from "./limitReminders";

const NOW = 1_800_000_000_000;
const inHours = (h: number) => Math.floor(NOW / 1000) + h * 3600;

describe("remindable", () => {
  it("offers the bell near the limit, before the reset", () => {
    expect(remindable({ usedPercent: REMIND_FROM_PERCENT, resetsAt: inHours(1) }, NOW, false)).toBe(true);
    expect(remindable({ usedPercent: 100, resetsAt: inHours(1) }, NOW, false)).toBe(true);
    expect(remindable({ usedPercent: 40, resetsAt: inHours(1) }, NOW, false)).toBe(false);
  });

  it("keeps the bell for a reminder already set", () => {
    expect(remindable({ usedPercent: 10, resetsAt: inHours(1) }, NOW, true)).toBe(true);
  });

  it("never offers a window that has reset or has no reset time", () => {
    expect(remindable({ usedPercent: 100, resetsAt: inHours(-1) }, NOW, true)).toBe(false);
    expect(remindable({ usedPercent: 100, resetsAt: 0 }, NOW, true)).toBe(false);
    expect(remindable(undefined, NOW, true)).toBe(false);
  });
});

describe("reminderFor", () => {
  it("matches the limit and the window", () => {
    const list: LimitReminder[] = [
      { limit: "codex", window: "weekly", resetsAt: 1, name: "Codex" },
      { limit: "claude:work", window: "fiveHour", resetsAt: 2, name: "Work" },
    ];
    expect(reminderFor(list, "codex", "weekly")?.name).toBe("Codex");
    expect(reminderFor(list, "codex", "fiveHour")).toBeUndefined();
  });
});
