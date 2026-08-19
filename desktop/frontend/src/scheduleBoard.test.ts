import { describe, expect, it } from "vitest";
import {
  agendaAhead,
  buildBoard,
  formatClock,
  untilLabel,
  recentRuns,
  runningJobs,
  startOfWeek,
  weekDays,
  weekRangeLabel,
} from "./scheduleBoard";
import type { JobInfo, JobSchedule } from "./jobsFormat";

const WEEK_START = new Date(2026, 7, 24, 0, 0, 0, 0);
const at = (dayOffset: number, hour: number, min = 0) =>
  Math.floor(new Date(2026, 7, 24 + dayOffset, hour, min, 0, 0).getTime() / 1000);

type Row = JobInfo & { project?: string };

const job = (over: Partial<Row>): Row => ({
  id: over.id ?? "j",
  valid: true,
  enabled: true,
  ...over,
});

const keyOf = (j: Row) => `${j.project ?? ""}/${j.id}`;
const daily = (hour: number): JobSchedule => ({
  mode: "calendar",
  atMinutes: hour * 60,
  days: [],
});

const build = (jobs: Row[], now = at(1, 8, 46)) =>
  buildBoard({ jobs, weekStart: WEEK_START, now, keyOf });

describe("startOfWeek", () => {
  it("rewinds to Monday whatever day it is handed", () => {
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 7, 24 + i, 13, 30);
      expect(startOfWeek(d).getDate()).toBe(24);
      expect(startOfWeek(d).getHours()).toBe(0);
    }
  });

  it("crosses a month boundary backwards", () => {
    expect(startOfWeek(new Date(2026, 8, 2)).getDate()).toBe(31);
  });
});

describe("weekDays", () => {
  it("marks today and the days already gone", () => {
    const days = weekDays(WEEK_START, at(2, 12));
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.weekday)).toEqual([
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
      "sun",
    ]);
    expect(days.filter((d) => d.isToday).map((d) => d.weekday)).toEqual(["wed"]);
    expect(days.filter((d) => d.isPast).map((d) => d.weekday)).toEqual(["mon", "tue"]);
  });
});

describe("buildBoard", () => {
  it("collapses bands with nothing in them into one quiet row", () => {
    const board = build([job({ schedule: daily(10) })]);
    const kinds = board.rows.map((r) => r.kind);
    expect(kinds.filter((k) => k === "band")).toHaveLength(1);
    // 00:00–09:00 before it and 12:00–24:00 after, each merged into one gap.
    expect(board.rows).toHaveLength(3);
    expect(board.rows[0]).toMatchObject({ kind: "quiet", band: { fromHour: 0, toHour: 9 } });
    expect(board.rows[2]).toMatchObject({ kind: "quiet", band: { fromHour: 12, toHour: 24 } });
  });

  it("puts a daily job in one cell on every day of its band", () => {
    const board = build([job({ schedule: daily(10) })]);
    const band = board.rows.find((r) => r.kind === "band");
    if (band?.kind !== "band") throw new Error("expected a band row");
    expect(band.band).toEqual({ fromHour: 9, toHour: 12 });
    expect(band.cells.map((c) => c.items.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it("stacks two jobs sharing a day and band in time order", () => {
    const board = build([
      job({ id: "late", schedule: { mode: "calendar", atMinutes: 600, days: ["thu"] } }),
      job({ id: "early", schedule: { mode: "calendar", atMinutes: 576, days: ["thu"] } }),
    ]);
    const band = board.rows.find((r) => r.kind === "band");
    if (band?.kind !== "band") throw new Error("expected a band row");
    expect(band.cells[3].items.map((i) => i.job.id)).toEqual(["early", "late"]);
    expect(band.cells[0].items).toHaveLength(0);
  });

  it("shows only the first few blocks in a crowded cell and counts the rest", () => {
    const jobs = Array.from({ length: 6 }, (_, i) =>
      job({ id: `j${i}`, schedule: { mode: "calendar", atMinutes: 600 + i, days: ["mon"] } }),
    );
    const board = build(jobs);
    const band = board.rows.find((r) => r.kind === "band");
    if (band?.kind !== "band") throw new Error("expected a band row");
    expect(band.cells[0].items).toHaveLength(3);
    expect(band.cells[0].hidden).toBe(3);
  });

  it("keeps manual and invalid jobs off the grid but not out of the view", () => {
    const board = build([
      job({ id: "manual", schedule: { mode: "manual" } }),
      job({ id: "broken", valid: false, error: "bad cron" }),
      job({ id: "ok", schedule: daily(10) }),
    ]);
    expect(board.unscheduled.map((j) => j.id).sort()).toEqual(["broken", "manual"]);
  });

  it("lists a job whose cadence is too tight to draw as dense", () => {
    const board = build([
      job({ id: "fast", schedule: { mode: "interval", everySecs: 60 }, nextFireAt: at(0, 1) }),
    ]);
    expect(board.dense.map((j) => j.id)).toEqual(["fast"]);
  });

  it("treats an unanchored interval as unscheduled rather than dropping it", () => {
    const board = build([
      job({ id: "drifting", schedule: { mode: "interval", everySecs: 86400 } }),
    ]);
    expect(board.unscheduled.map((j) => j.id)).toEqual(["drifting"]);
  });
});

describe("agendaAhead", () => {
  it("returns only what is due inside the horizon, soonest first", () => {
    const now = at(1, 8);
    const rows = agendaAhead(
      [
        job({ id: "later", schedule: daily(20) }),
        job({ id: "soon", schedule: daily(10) }),
        // Wed 10:00 sits past the 24h horizon from Tue 08:00.
        job({ id: "beyond", schedule: { mode: "calendar", atMinutes: 600, days: ["wed"] } }),
      ],
      now,
      24,
      keyOf,
    );
    expect(rows.map((r) => r.job.id)).toEqual(["soon", "later"]);
    expect(rows.every((r) => r.state === "due")).toBe(true);
  });

  it("repeats a job that fires more than once in the horizon", () => {
    const rows = agendaAhead(
      [job({ id: "twice", schedule: { mode: "interval", everySecs: 6 * 3600 }, nextFireAt: at(1, 10) })],
      at(1, 8),
      13,
      keyOf,
    );
    expect(rows.map((r) => r.at)).toEqual([at(1, 10), at(1, 16)]);
  });

  it("leaves paused jobs out — they are not going to fire", () => {
    const rows = agendaAhead(
      [job({ id: "off", schedule: daily(10), enabled: false })],
      at(1, 8),
      24,
      keyOf,
    );
    expect(rows).toEqual([]);
  });
});

describe("recentRuns", () => {
  it("gives each job's last run, newest first", () => {
    const rows = recentRuns(
      [
        job({ id: "old", lastRunAt: at(0, 9), lastResult: "done" }),
        job({ id: "never" }),
        job({ id: "new", lastRunAt: at(1, 9), lastResult: "failed", unread: 3 }),
      ],
      keyOf,
    );
    expect(rows.map((r) => r.job.id)).toEqual(["new", "old"]);
    expect(rows[0]).toMatchObject({ result: "failed", unread: 3 });
  });

  it("caps the list", () => {
    const jobs = Array.from({ length: 12 }, (_, i) =>
      job({ id: `j${i}`, lastRunAt: at(0, 1) + i }),
    );
    expect(recentRuns(jobs, keyOf, 4)).toHaveLength(4);
  });
});

describe("runningJobs", () => {
  it("lists live runs oldest first", () => {
    const rows = runningJobs([
      job({ id: "b", running: true, runningSince: at(1, 9) }),
      job({ id: "idle" }),
      job({ id: "a", running: true, runningSince: at(1, 8) }),
    ]);
    expect(rows.map((j) => j.id)).toEqual(["a", "b"]);
  });
});

describe("weekRangeLabel", () => {
  const monthCount = (label: string) => label.match(/\p{L}{3,}/gu)?.length ?? 0;

  it("names the month once when the week sits inside it", () => {
    const label = weekRangeLabel(new Date(2026, 7, 24), new Date(2026, 7, 26));
    expect(label).toContain("24");
    expect(label).toContain("30");
    expect(monthCount(label)).toBe(1);
  });

  it("names both months when the week straddles them", () => {
    const label = weekRangeLabel(new Date(2026, 7, 31), new Date(2026, 7, 31));
    expect(label).toContain("31");
    expect(label).toContain("6");
    expect(monthCount(label)).toBe(2);
  });

  it("adds the year only when the week leaves it", () => {
    const inYear = weekRangeLabel(new Date(2026, 7, 24), new Date(2026, 7, 26));
    const other = weekRangeLabel(new Date(2025, 11, 29), new Date(2026, 7, 26));
    expect(inYear).not.toContain("2026");
    expect(other).toContain("2025");
    expect(other).toContain("2026");
  });
});

describe("formatClock", () => {
  it("stays 24h and fixed-width", () => {
    expect(formatClock(at(0, 9, 5))).toBe("09:05");
    expect(formatClock(at(0, 19, 58))).toBe("19:58");
    expect(formatClock(at(0, 0, 0))).toBe("00:00");
  });
});

describe("untilLabel", () => {
  const now = at(0, 8);
  it("counts down in the largest two units that still matter", () => {
    expect(untilLabel(now + 30, now)).toBe("now");
    expect(untilLabel(now + 25 * 60, now)).toBe("in 25m");
    expect(untilLabel(now + 4 * 3600, now)).toBe("in 4h");
    expect(untilLabel(now + 4 * 3600 + 12 * 60, now)).toBe("in 4h 12m");
    expect(untilLabel(now + 3 * 86400, now)).toBe("in 3d");
    expect(untilLabel(now + 3 * 86400 + 3 * 3600, now)).toBe("in 3d 3h");
  });
});
