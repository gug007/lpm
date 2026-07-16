import { describe, expect, it } from "vitest";
import {
  buildJobPayload,
  defaultJobDraft,
  describeDraftSchedule,
  formatInterval,
  formatNextRun,
  formatSchedule,
  jobResultLabel,
  jobResultTone,
  payloadToDraft,
  validateJobDraft,
  type JobDraft,
} from "./jobsFormat";

describe("formatSchedule", () => {
  it("describes an every-day calendar schedule", () => {
    expect(
      formatSchedule({ mode: "calendar", atMinutes: 540, days: [] }),
    ).toBe("Every day at 09:00");
  });

  it("names selected days in week order and pluralizes them", () => {
    expect(
      formatSchedule({ mode: "calendar", atMinutes: 540, days: ["thu", "mon"] }),
    ).toBe("Mondays and Thursdays at 09:00");
    expect(
      formatSchedule({
        mode: "calendar",
        atMinutes: 450,
        days: ["fri", "mon", "wed"],
      }),
    ).toBe("Mondays, Wednesdays and Fridays at 07:30");
  });

  it("collapses all seven days to every day", () => {
    expect(
      formatSchedule({
        mode: "calendar",
        atMinutes: 0,
        days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      }),
    ).toBe("Every day at 00:00");
  });

  it("describes interval schedules", () => {
    expect(formatSchedule({ mode: "interval", everySecs: 6 * 3600 })).toBe(
      "Every 6 hours",
    );
    expect(formatSchedule({ mode: "interval", everySecs: 3600 })).toBe(
      "Every hour",
    );
    expect(formatSchedule({ mode: "interval", everySecs: 2 * 86400 })).toBe(
      "Every 2 days",
    );
    expect(formatSchedule({ mode: "interval", everySecs: 86400 })).toBe(
      "Every day",
    );
  });
});

describe("formatInterval", () => {
  it("prefers whole days when evenly divisible", () => {
    expect(formatInterval(48 * 3600)).toBe("Every 2 days");
    expect(formatInterval(5 * 3600)).toBe("Every 5 hours");
  });
});

describe("formatNextRun", () => {
  const now = new Date(2026, 6, 16, 8, 0, 0); // Thu Jul 16 2026 08:00 local

  it("returns empty when there is no next fire", () => {
    expect(formatNextRun(undefined, now)).toBe("");
  });

  it("says today when the fire is later the same day", () => {
    const at = new Date(2026, 6, 16, 14, 30, 0);
    expect(formatNextRun(Math.floor(at.getTime() / 1000), now)).toBe(
      "Next run today at 14:30",
    );
  });

  it("says tomorrow for the next day", () => {
    const at = new Date(2026, 6, 17, 9, 0, 0);
    expect(formatNextRun(Math.floor(at.getTime() / 1000), now)).toBe(
      "Next run tomorrow at 09:00",
    );
  });

  it("names the weekday within the coming week", () => {
    const at = new Date(2026, 6, 20, 9, 0, 0); // Monday
    expect(formatNextRun(Math.floor(at.getTime() / 1000), now)).toBe(
      "Next run Monday at 09:00",
    );
  });
});

describe("job result copy", () => {
  it("maps result strings to product-term labels and tones", () => {
    expect(jobResultLabel("nothing-to-do")).toBe("Nothing to do");
    expect(jobResultLabel("found-work", "app-abc123")).toBe(
      "Found work — running in app-abc123",
    );
    expect(jobResultLabel("skipped-pending-copy")).toBe(
      "Waiting — the copy from the last run is still open",
    );
    expect(jobResultTone("error")).toBe("error");
    expect(jobResultTone("found-work")).toBe("success");
    expect(jobResultTone("skipped-overlap")).toBe("warning");
  });
});

describe("draft <-> payload round-trip", () => {
  it("builds a calendar-with-days job payload", () => {
    const draft: JobDraft = {
      ...defaultJobDraft(),
      label: "Nightly deps",
      emoji: "📦",
      scheduleMode: "time",
      time: "09:00",
      days: ["mon", "thu"],
      check: "test -n \"$(npm outdated)\"",
      duplicate: true,
      runMode: "prompt",
      prompt: "Upgrade dependencies",
    };
    expect(buildJobPayload(draft)).toEqual({
      label: "Nightly deps",
      emoji: "📦",
      schedule: { at: "09:00", days: ["mon", "thu"] },
      check: 'test -n "$(npm outdated)"',
      duplicate: true,
      run: { prompt: "Upgrade dependencies" },
    });
  });

  it("omits days for every day and omits optional fields when empty", () => {
    const draft: JobDraft = {
      ...defaultJobDraft(),
      label: "Hourly build",
      scheduleMode: "interval",
      intervalValue: 6,
      intervalUnit: "hours",
      runMode: "cmd",
      cmd: "make",
    };
    expect(buildJobPayload(draft)).toEqual({
      label: "Hourly build",
      schedule: { every: "6h" },
      run: { cmd: "make" },
    });
  });

  it("round-trips a payload back into an equivalent draft", () => {
    const draft: JobDraft = {
      ...defaultJobDraft(),
      label: "Nightly deps",
      emoji: "📦",
      scheduleMode: "time",
      time: "09:00",
      days: ["mon", "thu"],
      check: "check.sh",
      duplicate: true,
      runMode: "action",
      action: "deploy",
    };
    const payload = buildJobPayload(draft);
    expect(payloadToDraft(payload)).toEqual(draft);
  });

  it("reads an interval-in-days payload", () => {
    const draft = payloadToDraft({
      label: "Weekly",
      schedule: { every: "2d" },
      run: { prompt: "hi" },
    });
    expect(draft.scheduleMode).toBe("interval");
    expect(draft.intervalValue).toBe(2);
    expect(draft.intervalUnit).toBe("days");
  });

  it("reads a bare-integer every as hours", () => {
    const draft = payloadToDraft({
      label: "X",
      schedule: { every: 6 },
      run: { cmd: "make" },
    });
    expect(draft.scheduleMode).toBe("interval");
    expect(draft.intervalValue).toBe(6);
    expect(draft.intervalUnit).toBe("hours");
  });
});

describe("describeDraftSchedule", () => {
  it("summarizes the draft live", () => {
    const draft = { ...defaultJobDraft(), time: "09:00", days: ["mon"] as const };
    expect(describeDraftSchedule({ ...draft, days: ["mon"] })).toBe(
      "Mondays at 09:00",
    );
    expect(
      describeDraftSchedule({
        ...defaultJobDraft(),
        scheduleMode: "interval",
        intervalValue: 3,
        intervalUnit: "hours",
      }),
    ).toBe("Every 3 hours");
  });
});

describe("validateJobDraft", () => {
  it("requires a name", () => {
    expect(validateJobDraft(defaultJobDraft())).toBe("Give this job a name.");
  });

  it("requires the chosen run target to be filled", () => {
    const base = { ...defaultJobDraft(), label: "X" };
    expect(validateJobDraft({ ...base, runMode: "prompt", prompt: "" })).toBe(
      "Enter a prompt to run.",
    );
    expect(validateJobDraft({ ...base, runMode: "cmd", cmd: "" })).toBe(
      "Enter a command to run.",
    );
    expect(validateJobDraft({ ...base, runMode: "action", action: "" })).toBe(
      "Choose an action to run.",
    );
  });

  it("passes a complete draft", () => {
    expect(
      validateJobDraft({
        ...defaultJobDraft(),
        label: "X",
        runMode: "cmd",
        cmd: "make",
      }),
    ).toBeNull();
  });
});
