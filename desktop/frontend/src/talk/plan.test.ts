import { describe, expect, it } from "vitest";
import {
  WHICH_PROJECT,
  readTalkReply,
  talkPlanReady,
  talkProjectChoices,
  talkRows,
  talkStepCount,
  type TalkPlan,
} from "./plan";

const projects = [
  { name: "glimpse", label: "glimpse", parent: "" },
  { name: "glimpse-api", label: "Glimpse API", parent: "" },
  { name: "saas-app", label: "saas-app", parent: "" },
];
const plan: TalkPlan = { project: "glimpse", where: "copy", agent: "claude", prompt: "fix the latest issue", label: "latest issue" };

describe("talkRows", () => {
  it("reads a copy as three steps: duplicate, start, send", () => {
    expect(talkRows(plan, projects).map((r) => [r.label, r.value])).toEqual([
      ["Duplicate", "glimpse"],
      ["Start", "Claude Code, in the copy"],
      ["Send", "fix the latest issue"],
    ]);
    expect(talkStepCount(plan)).toBe(3);
  });

  it("names a worktree, and the project itself when nothing is copied", () => {
    const worktree = talkRows({ ...plan, where: "worktree", project: "glimpse-api" }, projects);
    expect([worktree[0].label, worktree[0].value, worktree[1].value]).toEqual([
      "Worktree",
      "Glimpse API",
      "Claude Code, in the worktree",
    ]);
    const here = { ...plan, where: "here" as const, agent: "codex" };
    expect(talkRows(here, projects).slice(0, 2).map((r) => [r.label, r.value])).toEqual([
      ["In", "glimpse"],
      ["Start", "Codex"],
    ]);
    expect(talkStepCount(here)).toBe(2);
  });

  it("asks which project when none was matched, and holds the plan until told", () => {
    const open = { ...plan, project: "" };
    expect(talkRows(open, projects)[0]).toMatchObject({ value: WHICH_PROJECT, missing: true });
    expect(talkPlanReady(open)).toBe(false);
    expect(talkPlanReady({ ...plan, prompt: "  " })).toBe(false);
    expect(talkPlanReady(plan)).toBe(true);
  });
});

describe("talkProjectChoices", () => {
  it("lists what the sentence could have meant first", () => {
    expect(talkProjectChoices(projects, ["saas-app", "gone"]).map((p) => p.name)).toEqual([
      "saas-app",
      "glimpse",
      "glimpse-api",
    ]);
  });
});

describe("readTalkReply", () => {
  it("keeps a plan and says why there is none", () => {
    expect(readTalkReply({ ok: true, plan })).toEqual({ ok: true, plan, candidates: [] });
    expect(readTalkReply({ ok: false, error: "A plan can't delete projects.", unsupported: true })).toEqual({
      ok: false,
      error: "A plan can't delete projects.",
      unsupported: true,
    });
    expect(readTalkReply(null)).toEqual({ ok: false, error: "Couldn't make a plan.", unsupported: false });
  });
});
