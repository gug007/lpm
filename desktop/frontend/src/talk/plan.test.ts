import { describe, expect, it } from "vitest";
import {
  TALK_PLACES,
  readTalkReply,
  talkAgentLabel,
  talkPlaceLabel,
  talkPlanReady,
  talkProjectChoices,
  talkProjectLabel,
  type TalkPlan,
} from "./plan";

const projects = [
  { name: "glimpse", label: "glimpse", parent: "" },
  { name: "glimpse-api", label: "Glimpse API", parent: "" },
  { name: "saas-app", label: "saas-app", parent: "" },
];
const plan: TalkPlan = { project: "glimpse", where: "copy", agent: "claude", prompt: "fix the latest issue", label: "latest issue" };

describe("the plan's rows", () => {
  it("names where the agent starts, and offers every place", () => {
    expect(talkPlaceLabel("copy")).toBe("Duplicate");
    expect(talkPlaceLabel("worktree")).toBe("Worktree");
    expect(talkPlaceLabel("here")).toBe("In");
    expect(TALK_PLACES.map((p) => p.choice)).toEqual(["In the project", "In a duplicate", "In a worktree"]);
  });

  it("shows projects and agents as the sidebar names them", () => {
    expect(talkProjectLabel("glimpse-api", projects)).toBe("Glimpse API");
    expect(talkProjectLabel("gone", projects)).toBe("gone");
    expect(talkAgentLabel("codex")).toBe("Codex");
  });

  it("holds the plan until it has a project and a prompt", () => {
    const open = { ...plan, project: "" };
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
