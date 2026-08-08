import { describe, expect, it } from "vitest";
import { jobScopeLabel, sortJobsForList } from "./jobsList";
import type { JobInfo } from "./jobsFormat";

const job = (over: Partial<JobInfo> & { project?: string }): JobInfo & { project?: string } => ({
  id: over.id ?? "job",
  valid: true,
  enabled: true,
  ...over,
});

describe("sortJobsForList", () => {
  it("puts unread ahead of read, whatever their run times", () => {
    const rows = [
      job({ id: "read-recent", lastRunAt: 500 }),
      job({ id: "unread-old", lastRunAt: 100, unread: 1 }),
    ];
    expect(sortJobsForList(rows).map((r) => r.id)).toEqual([
      "unread-old",
      "read-recent",
    ]);
  });

  it("orders each half by newest activity, then by name", () => {
    const rows = [
      job({ id: "b", label: "B" }),
      job({ id: "older", lastRunAt: 100 }),
      job({ id: "a", label: "A" }),
      job({ id: "newer", lastRunAt: 900 }),
    ];
    expect(sortJobsForList(rows).map((r) => r.id)).toEqual([
      "newer",
      "older",
      "a",
      "b",
    ]);
  });

  it("keeps a running job above idle ones of the same read state", () => {
    const rows = [
      job({ id: "idle", lastRunAt: 900 }),
      job({ id: "live", running: true, lastRunAt: 100 }),
    ];
    expect(sortJobsForList(rows).map((r) => r.id)).toEqual(["live", "idle"]);
  });
});

describe("jobScopeLabel", () => {
  const upper = (name: string) => name.toUpperCase();

  it("names the one project a job runs in", () => {
    expect(jobScopeLabel(job({ targets: ["lpm"] }), 4, upper)).toBe("LPM");
  });

  it("counts several, and says All projects when that is all of them", () => {
    expect(jobScopeLabel(job({ targets: ["a", "b"] }), 4, upper)).toBe("2 projects");
    expect(jobScopeLabel(job({ targets: ["a", "b"] }), 2, upper)).toBe("All projects");
  });

  it("calls a standalone job's scope No project", () => {
    expect(jobScopeLabel(job({ standalone: true }), 4, upper)).toBe("No project");
  });
});
