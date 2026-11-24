import { describe, expect, it } from "vitest";
import {
  buildJobPayload,
  defaultJobDraft,
  describeDraftSchedule,
  formatSchedule,
  payloadToDraft,
  validateJobDraft,
  type JobDraft,
} from "./jobsFormat";
import { describeFirstRun } from "./jobsFirstRun";
import { draftToSchedule } from "./jobsScheduleDraft";
import { eventLimitOptions, splitNames, type JobEventKind } from "./jobsEvents";
import { textToPrompt } from "./composerValue";

function eventDraft(values: Partial<JobDraft>): JobDraft {
  return {
    ...defaultJobDraft(),
    label: "Fix CI",
    prompt: textToPrompt("Make the checks pass."),
    scheduleKind: "event",
    ...values,
  };
}

describe("event schedules", () => {
  it("write only the chosen event's filter, and atMost only when it isn't the default", () => {
    const draft = eventDraft({
      eventOn: "ciFailed",
      eventBranches: "main, release, main",
      eventServices: "api",
    });
    expect(buildJobPayload(draft).schedule).toEqual({ on: "ciFailed", branches: ["main", "release"] });
    expect(buildJobPayload({ ...draft, eventAtMost: "day" }).schedule).toEqual({
      on: "ciFailed",
      branches: ["main", "release"],
      atMost: "day",
    });
    expect(buildJobPayload({ ...draft, eventOn: "serviceCrashed" }).schedule).toEqual({
      on: "serviceCrashed",
      services: ["api"],
    });
  });

  it("read back into the editor as they were written", () => {
    const draft = payloadToDraft({
      label: "Watch docs",
      schedule: { on: "agentFinished", from: "docs-site", atMost: "day" },
      run: { prompt: "Review what changed." },
    });
    expect(draft.scheduleKind).toBe("event");
    expect(draft.eventOn).toBe("agentFinished");
    expect(draft.eventFrom).toBe("docs-site");
    expect(draft.eventAtMost).toBe("day");
    expect(buildJobPayload(draft).schedule).toEqual({ on: "agentFinished", from: ["docs-site"], atMost: "day" });
  });

  it("say what starts the job", () => {
    expect(describeDraftSchedule(eventDraft({ eventBranches: "main" }))).toBe("When CI fails on main");
    expect(formatSchedule({ mode: "event", on: "serviceCrashed", services: ["api", "worker"], atMost: "commit" })).toBe(
      "When api or worker crashes",
    );
    expect(formatSchedule({ mode: "event", on: "serviceCrashed", atMost: "commit" })).toBe("When a service crashes");
    expect(formatSchedule({ mode: "event", on: "agentFinished", from: ["a", "b", "c"], atMost: "day" })).toBe(
      "When an agent finishes in a, b or c, once a day",
    );
    const schedule = draftToSchedule(eventDraft({}));
    expect(describeFirstRun(schedule)).toEqual({ first: "Runs when CI fails" });
  });

  it("take the branch a pull request goes into", () => {
    const draft = eventDraft({ eventOn: "prReviewed", eventBranches: "main", eventServices: "api" });
    expect(buildJobPayload(draft).schedule).toEqual({ on: "prReviewed", branches: ["main"] });
    expect(buildJobPayload({ ...draft, eventOn: "prOpened" }).schedule).toEqual({ on: "prOpened", branches: ["main"] });
    const read = payloadToDraft({ schedule: { on: "prOpened", branches: "main" }, run: { prompt: "Review it." } });
    expect([read.eventOn, read.eventBranches]).toEqual(["prOpened", "main"]);
    expect(formatSchedule({ mode: "event", on: "prReviewed", atMost: "commit" })).toBe("When a PR gets a review");
    expect(formatSchedule({ mode: "event", on: "prReviewed", branches: ["main", "dev"], atMost: "day" })).toBe(
      "When a PR into main or dev gets a review, once a day",
    );
    expect(formatSchedule({ mode: "event", on: "prOpened", branches: ["main"], atMost: "commit" })).toBe(
      "When a PR into main is opened",
    );
    expect(describeFirstRun(draftToSchedule({ ...draft, eventBranches: "" }))).toEqual({
      first: "Runs when a PR gets a review",
    });
  });

  it("count by what the event is about", () => {
    const first = (on: JobEventKind) => eventLimitOptions(on)[0];
    expect(first("ciFailed")).toEqual({ value: "commit", label: "Once per commit" });
    expect(first("prReviewed")).toEqual({ value: "commit", label: "Once per review" });
    expect(first("prOpened")).toEqual({ value: "commit", label: "Once per PR" });
  });

  it("refuse an action an agent's finish would start", () => {
    const draft = eventDraft({ eventOn: "agentFinished", runMode: "action", action: "claude" });
    expect(validateJobDraft(draft)).toBe("An agent finishing can start a prompt or a command, not an action.");
    expect(validateJobDraft({ ...draft, eventOn: "ciFailed" })).toBeNull();
  });

  it("split typed names on commas and drop blanks and repeats", () => {
    expect(splitNames(" main,, release ,main ")).toEqual(["main", "release"]);
  });
});
