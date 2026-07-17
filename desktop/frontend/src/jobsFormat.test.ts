import { describe, expect, it } from "vitest";
import {
  buildJobPayload,
  defaultJobDraft,
  describeDraftSchedule,
  formatCost,
  formatDuration,
  formatInterval,
  formatNextRun,
  formatRunningFor,
  formatSchedule,
  groupJobThreads,
  jobOutputSnippet,
  jobThreadTail,
  liveOutputTail,
  jobResultLabel,
  jobResultTone,
  payloadToDraft,
  validateJobDraft,
  type JobDraft,
} from "./jobsFormat";
import { EMPTY_COMPOSER, type ComposerImage } from "./composerValue";

const prompt = (text: string, images: ComposerImage[] = []) => ({
  text,
  images,
  pending: false,
});

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

  it("treats an overdue fire point as imminent, never a past timestamp", () => {
    const at = new Date(2026, 6, 16, 7, 55, 0);
    expect(formatNextRun(Math.floor(at.getTime() / 1000), now)).toBe(
      "Next run in a moment",
    );
    expect(formatNextRun(Math.floor(now.getTime() / 1000), now)).toBe(
      "Next run in a moment",
    );
  });
});

describe("formatDuration", () => {
  it("scales seconds into minutes and hours", () => {
    expect(formatDuration(12)).toBe("12s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(4 * 60 + 30)).toBe("4m 30s");
    expect(formatDuration(60 * 60)).toBe("1h");
    expect(formatDuration(72 * 60)).toBe("1h 12m");
  });
});

describe("formatCost", () => {
  it("shows cents and floors tiny costs", () => {
    expect(formatCost(0.42)).toBe("$0.42");
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(0.001)).toBe("<$0.01");
  });
});

describe("jobOutputSnippet", () => {
  it("flattens markdown into one elided line", () => {
    expect(
      jobOutputSnippet("## Done\n\nUpgraded **3 deps** via [PR](https://x.y).\n```\nnpm i\n```\n- all tests pass"),
    ).toBe("Done Upgraded 3 deps via PR. - all tests pass");
    expect(jobOutputSnippet(undefined)).toBe("");
    expect(jobOutputSnippet("x".repeat(200), 10)).toBe(`${"x".repeat(10)}…`);
  });
});

describe("liveOutputTail", () => {
  it("keeps the last lines, stripped of terminal escapes", () => {
    expect(liveOutputTail("one\ntwo\nthree\n\n\n", 2)).toBe("two\nthree");
    expect(liveOutputTail("\x1b[32mgreen\x1b[0m text\r\n")).toBe(
      "green text",
    );
    expect(liveOutputTail("[info] brackets survive")).toBe(
      "[info] brackets survive",
    );
    expect(liveOutputTail(undefined)).toBe("");
    expect(liveOutputTail("   \n \n")).toBe("");
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

  it("labels stopped and timed-out runs", () => {
    expect(jobResultLabel("canceled")).toBe("Stopped");
    expect(jobResultTone("canceled")).toBe("neutral");
    expect(jobResultLabel("timed-out")).toBe("Stopped — ran too long");
    expect(jobResultTone("timed-out")).toBe("error");
  });
});

describe("groupJobThreads", () => {
  it("threads replies onto the run they continued, across newer runs", () => {
    const entries = [
      { at: 1, result: "completed", output: "run A", session: "a1" },
      { at: 2, result: "nothing-to-do" },
      { at: 3, result: "completed", output: "run B", session: "b1" },
      { at: 4, result: "completed", output: "re A", session: "a2", resumed: "a1", question: "why?" },
      { at: 5, result: "completed", output: "re re A", session: "a3", resumed: "a2", question: "go on" },
      { at: 6, result: "completed", output: "re B", session: "b2", resumed: "b1", question: "ship it" },
    ];
    const threads = groupJobThreads(entries);
    expect(threads.map((t) => t.root.at)).toEqual([1, 2, 3]);
    expect(threads[0].replies.map((r) => r.at)).toEqual([4, 5]);
    expect(threads[1].replies).toEqual([]);
    expect(threads[2].replies.map((r) => r.at)).toEqual([6]);
    expect(jobThreadTail(threads[0]).at).toBe(5);
    expect(jobThreadTail(threads[0]).session).toBe("a3");
    expect(jobThreadTail(threads[1]).at).toBe(2);
    expect(jobThreadTail(threads[2]).session).toBe("b2");
  });

  it("threads sessionless replies via follows, keeping the tail replyable", () => {
    const threads = groupJobThreads([
      { at: 1, result: "completed", output: "codex run" },
      { at: 2, result: "completed", output: "run B", session: "b1" },
      { at: 3, result: "completed", output: "codex reply", question: "and?", follows: 1 },
      { at: 4, result: "completed", output: "more", question: "more?", follows: 3 },
    ]);
    expect(threads.map((t) => t.root.at)).toEqual([1, 2]);
    expect(threads[0].replies.map((r) => r.at)).toEqual([3, 4]);
    expect(jobThreadTail(threads[0]).at).toBe(4);
    expect(jobThreadTail(threads[0]).session).toBeUndefined();
  });

  it("keeps an orphaned reply as its own thread when its run scrolled off", () => {
    const threads = groupJobThreads([
      { at: 9, result: "completed", output: "answer", session: "n2", resumed: "gone", question: "hm?" },
    ]);
    expect(threads).toHaveLength(1);
    expect(jobThreadTail(threads[0]).session).toBe("n2");
  });

  it("keeps a context-full reply in its thread, still replyable via the tail", () => {
    const threads = groupJobThreads([
      { at: 1, result: "completed", output: "run", session: "s1" },
      { at: 2, result: "context-full", question: "and?", resumed: "s1" },
    ]);
    expect(threads).toHaveLength(1);
    expect(jobThreadTail(threads[0]).at).toBe(2);
    expect(jobResultLabel("context-full")).toBe("Conversation full");
    expect(jobResultTone("context-full")).toBe("warning");
  });
});

describe("formatRunningFor", () => {
  const started = 1_700_000_000;
  const at = (elapsedSecs: number) => (started + elapsedSecs) * 1000;

  it("stays bare under a minute", () => {
    expect(formatRunningFor(started, at(0))).toBe("Running");
    expect(formatRunningFor(started, at(59))).toBe("Running");
    expect(formatRunningFor(undefined, at(500))).toBe("Running");
  });

  it("shows minutes, then hours and minutes", () => {
    expect(formatRunningFor(started, at(60))).toBe("Running — 1m");
    expect(formatRunningFor(started, at(59 * 60))).toBe("Running — 59m");
    expect(formatRunningFor(started, at(72 * 60))).toBe("Running — 1h 12m");
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
      prompt: prompt("Upgrade dependencies"),
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

  it("round-trips read-only access and omits the default full access", () => {
    const readOnly: JobDraft = {
      ...defaultJobDraft(),
      label: "Report",
      runMode: "prompt",
      prompt: prompt("Summarize open TODOs"),
      access: "read",
    };
    expect(buildJobPayload(readOnly).run).toEqual({
      prompt: "Summarize open TODOs",
      access: "read",
    });
    expect(payloadToDraft(buildJobPayload(readOnly))).toEqual(readOnly);

    const full = buildJobPayload({ ...readOnly, access: "full" });
    expect(full.run).toEqual({ prompt: "Summarize open TODOs" });
    expect(payloadToDraft(full).access).toBe("full");
  });
});

describe("prompt attachments", () => {
  it("inlines each attachment's path where its token stood", () => {
    const draft: JobDraft = {
      ...defaultJobDraft(),
      label: "Ship",
      runMode: "prompt",
      prompt: prompt("Match [Image #2] and\nthen[Image #1]ship it", [
        { token: 2, path: "/tmp/lpm/before.png" },
        { token: 1, path: "/tmp/lpm/after.jpeg" },
      ]),
    };
    expect(buildJobPayload(draft).run).toEqual({
      prompt: "Match /tmp/lpm/before.png and\nthen /tmp/lpm/after.jpeg ship it",
    });
  });

  it("drops a token whose image is gone", () => {
    expect(
      buildJobPayload({
        ...defaultJobDraft(),
        label: "X",
        runMode: "prompt",
        prompt: prompt("look [Image #1] here"),
      }).run,
    ).toEqual({ prompt: "look  here" });
  });

  it("rebuilds attachments from the stored text, numbering them in order", () => {
    const draft = payloadToDraft({
      label: "X",
      schedule: { at: "09:00" },
      run: { prompt: "compare /tmp/a.png with /tmp/b.webp" },
    });
    expect(draft.prompt).toEqual(
      prompt("compare [Image #1] with [Image #2]", [
        { token: 1, path: "/tmp/a.png" },
        { token: 2, path: "/tmp/b.webp" },
      ]),
    );
  });

  it("leaves non-image and relative paths as plain text", () => {
    const draft = payloadToDraft({
      label: "X",
      schedule: { at: "09:00" },
      run: { prompt: "read /src/app.tsx and src/logo.png and /notes.txt" },
    });
    expect(draft.prompt).toEqual(
      prompt("read /src/app.tsx and src/logo.png and /notes.txt"),
    );
  });

  it("round-trips a prompt with attachments back to the same stored text", () => {
    const draft: JobDraft = {
      ...defaultJobDraft(),
      label: "Ship",
      runMode: "prompt",
      prompt: prompt("Match [Image #1] exactly", [
        { token: 1, path: "/tmp/lpm/shot.png" },
      ]),
    };
    const payload = buildJobPayload(draft);
    const back = payloadToDraft(payload);
    expect(back.prompt).toEqual(draft.prompt);
    expect(buildJobPayload(back)).toEqual(payload);
  });

  it("round-trips a plain multi-line prompt verbatim", () => {
    const draft: JobDraft = {
      ...defaultJobDraft(),
      label: "Report",
      runMode: "prompt",
      prompt: prompt("Check the deps.\n\nIf any are stale, upgrade them."),
    };
    expect(payloadToDraft(buildJobPayload(draft))).toEqual(draft);
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
    expect(
      validateJobDraft({ ...base, runMode: "prompt", prompt: EMPTY_COMPOSER }),
    ).toBe(
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
