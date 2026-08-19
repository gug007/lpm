import { describe, expect, it } from "vitest";
import { expandSchedule, jobOccurrences, weekdayOf } from "./jobsOccurrences";
import type { JobInfo, JobSchedule } from "./jobsFormat";

// Mon 24 Aug 2026, local midnight — the week the board tests all sit in.
const MON = new Date(2026, 7, 24, 0, 0, 0, 0);
const secs = (d: Date) => Math.floor(d.getTime() / 1000);
const at = (dayOffset: number, hour: number, min = 0) =>
  secs(new Date(2026, 7, 24 + dayOffset, hour, min, 0, 0));

const WEEK = { from: at(0, 0), to: at(7, 0) };

const job = (over: Partial<JobInfo>): JobInfo => ({
  id: "j",
  valid: true,
  enabled: true,
  ...over,
});

const daily: JobSchedule = { mode: "calendar", atMinutes: 600, days: [] };

describe("weekdayOf", () => {
  it("reads Monday as the first day of the week", () => {
    expect(weekdayOf(MON.getTime())).toBe("mon");
    expect(weekdayOf(new Date(2026, 7, 30).getTime())).toBe("sun");
  });
});

describe("expandSchedule", () => {
  it("puts a daily calendar job on all seven days at its time", () => {
    const { slots } = expandSchedule(daily, WEEK);
    expect(slots).toHaveLength(7);
    expect(slots.map((s) => s.at)).toEqual([0, 1, 2, 3, 4, 5, 6].map((d) => at(d, 10)));
    expect(slots.every((s) => !s.approximate)).toBe(true);
  });

  it("treats a full seven-day list the same as an empty one", () => {
    const all: JobSchedule = {
      mode: "calendar",
      atMinutes: 600,
      days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    };
    expect(expandSchedule(all, WEEK).slots).toHaveLength(7);
  });

  it("places a named-day job only on those days", () => {
    const sched: JobSchedule = { mode: "calendar", atMinutes: 540, days: ["sat"] };
    const { slots } = expandSchedule(sched, WEEK);
    expect(slots.map((s) => s.at)).toEqual([at(5, 9)]);
  });

  it("carries a window as untilAt and marks the slot approximate", () => {
    const sched: JobSchedule = {
      mode: "calendar",
      atMinutes: 540,
      days: ["mon"],
      untilMinutes: 1020,
    };
    const [slot] = expandSchedule(sched, WEEK).slots;
    expect(slot.at).toBe(at(0, 9));
    expect(slot.untilAt).toBe(at(0, 17));
    expect(slot.approximate).toBe(true);
  });

  it("ignores an until that would run backwards", () => {
    const sched: JobSchedule = {
      mode: "calendar",
      atMinutes: 1020,
      days: ["mon"],
      untilMinutes: 540,
    };
    expect(expandSchedule(sched, WEEK).slots[0].untilAt).toBeUndefined();
  });

  it("marks a random day pick approximate, keeping every candidate day", () => {
    const sched: JobSchedule = {
      mode: "calendar",
      atMinutes: 540,
      days: ["mon", "tue", "wed", "thu", "fri"],
      pickDays: 2,
    };
    const { slots } = expandSchedule(sched, WEEK);
    expect(slots).toHaveLength(5);
    expect(slots.every((s) => s.approximate)).toBe(true);
  });

  it("carries how many runs a windowed slot stands for", () => {
    const sched: JobSchedule = {
      mode: "calendar",
      atMinutes: 540,
      days: ["mon"],
      untilMinutes: 1020,
      times: 3,
    };
    expect(expandSchedule(sched, WEEK).slots[0].count).toBe(3);
  });

  it("steps an interval both back and forward from the next fire", () => {
    const sched: JobSchedule = { mode: "interval", everySecs: 86400 };
    const { slots } = expandSchedule(sched, WEEK, { nextFireAt: at(3, 12) });
    expect(slots.map((s) => s.at)).toEqual([
      at(0, 12),
      at(1, 12),
      at(2, 12),
      at(3, 12),
      at(4, 12),
      at(5, 12),
      at(6, 12),
    ]);
  });

  it("falls back to the last run when there is no next fire", () => {
    const sched: JobSchedule = { mode: "interval", everySecs: 86400 };
    const { slots } = expandSchedule(sched, WEEK, { lastRunAt: at(1, 8) });
    expect(slots[0].at).toBe(at(0, 8));
  });

  it("draws nothing for an interval it cannot anchor", () => {
    const sched: JobSchedule = { mode: "interval", everySecs: 86400 };
    expect(expandSchedule(sched, WEEK).slots).toEqual([]);
  });

  it("marks a gap drawn from a band approximate", () => {
    const sched: JobSchedule = {
      mode: "interval",
      everySecs: 4 * 3600,
      everyMaxSecs: 8 * 3600,
    };
    const { slots } = expandSchedule(sched, WEEK, { nextFireAt: at(1, 0) });
    expect(slots.every((s) => s.approximate)).toBe(true);
  });

  it("stops expanding a cadence too tight to draw", () => {
    const sched: JobSchedule = { mode: "interval", everySecs: 60 };
    const { slots, truncated } = expandSchedule(sched, WEEK, { nextFireAt: at(0, 1) });
    expect(truncated).toBe(true);
    expect(slots.length).toBeLessThanOrEqual(400);
  });

  it("draws nothing for a manual job or an inverted window", () => {
    expect(expandSchedule({ mode: "manual" }, WEEK).slots).toEqual([]);
    expect(expandSchedule(daily, { from: WEEK.to, to: WEEK.from }).slots).toEqual([]);
  });
});

describe("jobOccurrences", () => {
  const now = at(2, 12);

  it("splits slots into what is past and what is still due", () => {
    const { occurrences } = jobOccurrences(job({ schedule: daily }), WEEK, now, "k");
    expect(occurrences.map((o) => o.state)).toEqual([
      "past",
      "past",
      "past",
      "due",
      "due",
      "due",
      "due",
    ]);
  });

  it("lets the last run take over the slot it belongs to", () => {
    const { occurrences } = jobOccurrences(
      job({ schedule: daily, lastRunAt: at(1, 10, 4), lastResult: "done" }),
      WEEK,
      now,
      "k",
    );
    const ran = occurrences.filter((o) => o.state === "ran");
    expect(ran).toHaveLength(1);
    expect(ran[0].at).toBe(at(1, 10, 4));
    expect(ran[0].result).toBe("done");
    expect(occurrences).toHaveLength(7);
  });

  it("keeps a run that matches no slot as its own entry", () => {
    const { occurrences } = jobOccurrences(
      job({ schedule: daily, lastRunAt: at(1, 3), lastResult: "done" }),
      WEEK,
      now,
      "k",
    );
    expect(occurrences).toHaveLength(8);
    expect(occurrences.find((o) => o.at === at(1, 3))?.state).toBe("ran");
  });

  it("lets a windowed slot own any run inside it", () => {
    const sched: JobSchedule = {
      mode: "calendar",
      atMinutes: 540,
      days: ["tue"],
      untilMinutes: 1020,
    };
    const { occurrences } = jobOccurrences(
      job({ schedule: sched, lastRunAt: at(1, 15), lastResult: "done" }),
      WEEK,
      now,
      "k",
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].state).toBe("ran");
    expect(occurrences[0].approximate).toBe(false);
  });

  it("marks the live run and leaves it without a result", () => {
    const { occurrences } = jobOccurrences(
      job({
        schedule: daily,
        running: true,
        runningSince: at(2, 9, 58),
        lastRunAt: at(1, 10),
        lastResult: "done",
      }),
      WEEK,
      now,
      "k",
    );
    const live = occurrences.filter((o) => o.state === "running");
    expect(live).toHaveLength(1);
    expect(live[0].at).toBe(at(2, 9, 58));
    expect(live[0].result).toBeUndefined();
  });

  it("shows a paused job's slots as where it would have run", () => {
    const { occurrences } = jobOccurrences(
      job({ schedule: daily, enabled: false }),
      WEEK,
      now,
      "k",
    );
    expect(occurrences.every((o) => o.state === "paused")).toBe(true);
  });

  it("keys every slot uniquely so the grid can render a list", () => {
    const { occurrences } = jobOccurrences(job({ schedule: daily }), WEEK, now, "proj/j");
    const keys = occurrences.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0].startsWith("proj/j@")).toBe(true);
  });
});
