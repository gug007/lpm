// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleWeekView } from "./ScheduleWeekView";
import type { ScheduledJob } from "../../../../hooks/useJobs";

// Tue 25 Aug 2026, 08:46 local — mid-week, so the board has past days, a live
// run, and days still ahead all at once.
const NOW = new Date(2026, 7, 25, 8, 46, 0, 0);
const at = (dayOffset: number, hour: number, min = 0) =>
  Math.floor(new Date(2026, 7, 24 + dayOffset, hour, min, 0, 0).getTime() / 1000);

const job = (over: Partial<ScheduledJob>): ScheduledJob => ({
  id: over.id ?? "j",
  valid: true,
  enabled: true,
  ...over,
});

const JOBS: ScheduledJob[] = [
  job({
    id: "karu-news",
    label: "Karucapatoxic News",
    emoji: "🇦🇲",
    project: "karucapatoxic",
    targets: ["karucapatoxic"],
    schedule: { mode: "calendar", atMinutes: 600, days: [] },
    nextFireAt: at(1, 10),
    lastRunAt: at(0, 10),
    lastResult: "done",
    unread: 5,
  }),
  job({
    id: "nightly",
    label: "Nightly test sweep",
    emoji: "🧪",
    project: "lpm-desktop",
    targets: ["lpm-desktop"],
    schedule: { mode: "calendar", atMinutes: 8 * 60 + 44, days: [] },
    running: true,
    runningSince: at(1, 8, 44),
  }),
  job({
    id: "seo",
    label: "Website Growth & SEO Page Ideas",
    emoji: "💡",
    project: "karucapatoxic",
    targets: ["karucapatoxic"],
    schedule: { mode: "calendar", atMinutes: 540, days: ["sat"] },
    nextFireAt: at(5, 9),
  }),
  job({
    id: "stt",
    label: "New speech-to-text models",
    emoji: "🍎",
    project: "lpm",
    targets: ["lpm"],
    schedule: { mode: "interval", everySecs: 14 * 86400 },
    nextFireAt: at(4, 19, 58),
    lastRunAt: at(-9, 19, 58),
    lastResult: "done",
  }),
  job({
    id: "audit",
    label: "Dependency audit",
    emoji: "🔒",
    project: "digitory",
    targets: ["digitory"],
    schedule: { mode: "calendar", atMinutes: 120, days: [] },
    nextFireAt: at(2, 2),
    lastRunAt: at(1, 2),
    lastResult: "failed",
  }),
  job({
    id: "changelog",
    label: "Changelog draft",
    emoji: "📝",
    project: "lpm",
    targets: ["lpm"],
    enabled: false,
    schedule: { mode: "calendar", atMinutes: 1020, days: ["fri"] },
    lastRunAt: at(-10, 17),
    lastResult: "done",
  }),
  job({
    id: "upgrade",
    label: "Upgrade dependencies",
    emoji: "🌳",
    targets: ["lpm", "lpm-desktop", "digitory"],
    schedule: { mode: "manual" },
    lastRunAt: at(-30, 12),
    lastResult: "done",
  }),
];

let container: HTMLDivElement;
let root: Root;

function render(jobs: ScheduledJob[] = JOBS) {
  act(() => {
    root.render(
      <ScheduleWeekView
        jobs={jobs}
        scopeLabelFor={(j) => j.targets?.[0] ?? "No project"}
        keyOf={(j) => `${j.project ?? ""}/${j.id}`}
        projectLabel={(name) => name}
        onOpen={() => {}}
        onRunNow={() => {}}
        onStop={() => {}}
      />,
    );
  });
  return container.textContent ?? "";
}

const grid = () =>
  container.querySelector("[role='group'][aria-label='Week schedule']");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("ScheduleWeekView", () => {
  it("renders the week the jobs actually fall in", () => {
    const text = render();
    expect(text).toContain("This week");
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(text).toContain(day);
    }
    expect(container.querySelector("[aria-label='Previous week']")).not.toBeNull();
  });

  it("puts a daily job on every day of the week", () => {
    render();
    expect(grid()?.querySelectorAll("button[title*='Karucapatoxic News']")).toHaveLength(7);
  });

  it("places a weekly job on its one day only", () => {
    render();
    expect(grid()?.querySelectorAll("button[title*='SEO Page Ideas']")).toHaveLength(1);
  });

  it("shows the live run in the board and in the agenda", () => {
    const text = render();
    expect(text).toContain("Nightly test sweep");
    expect(text).toMatch(/Running/i);
  });

  it("keeps the manual job off the grid and in its own tray", () => {
    const text = render();
    expect(text).toContain("Upgrade dependencies");
    expect(grid()?.querySelectorAll("button[title*='Upgrade dependencies']")).toHaveLength(0);
    expect(text).toMatch(/run|manual/i);
  });

  it("collapses the hours nothing is scheduled in", () => {
    const text = render();
    expect(text).toContain("nothing scheduled");
  });

  it("lists what finished recently and what lands next", () => {
    const text = render();
    expect(text).toMatch(/next 24 hours/i);
    expect(text).toMatch(/recently finished|finished/i);
    expect(text).toContain("Dependency audit");
  });

  it("names every project on the board in the legend", () => {
    const text = render();
    for (const project of ["karucapatoxic", "lpm-desktop", "digitory"]) {
      expect(text).toContain(project);
    }
  });

  it("survives a week with no jobs at all", () => {
    expect(() => render([])).not.toThrow();
  });

  it("steps to another week without losing the board", () => {
    render();
    const next = container.querySelector<HTMLButtonElement>("[aria-label='Next week']");
    expect(next).not.toBeNull();
    act(() => next?.click());
    expect(container.textContent).toContain("Week of");
    expect(container.querySelector("[aria-label='Previous week']")).not.toBeNull();
  });
});
