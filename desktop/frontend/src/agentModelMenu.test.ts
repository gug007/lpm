import { describe, expect, it } from "vitest";
import { effortBlurb, menuEffect, type MenuCursor } from "./agentModelMenu";

const cursor = (over: Partial<MenuCursor> = {}): MenuCursor => ({
  column: "model",
  model: "opus",
  effort: "",
  ...over,
});

describe("effortBlurb", () => {
  it("describes each CLI's levels in that CLI's own words", () => {
    expect(effortBlurb("claude", "ultracode")).toBe(
      "xhigh + dynamic workflow orchestration, this session only",
    );
    expect(effortBlurb("claude", "auto")).toBe("Use the default effort level for your model");
    expect(effortBlurb("codex", "low")).toBe("Fast responses with lighter reasoning");
  });

  it("does not borrow one CLI's wording for the other", () => {
    expect(effortBlurb("codex", "low")).not.toBe(effortBlurb("claude", "low"));
    expect(effortBlurb("codex", "ultracode")).toBe("");
    expect(effortBlurb("claude", "ultra")).toBe("");
  });

  it("is empty for a level neither CLI describes", () => {
    expect(effortBlurb("claude", "")).toBe("");
    expect(effortBlurb("codex", "nonsense")).toBe("");
  });
});

describe("menuEffect", () => {
  // The columns can't show this on their own: a bare model pick leaves Claude's
  // level alone but resets Codex's, because Codex's picker confirms one every pass.
  it("spells out what a bare model pick does to the level, per CLI", () => {
    expect(menuEffect("claude", cursor(), { model: "sonnet", effort: "high" })).toBe(
      "Switch to Opus, leaving the level alone",
    );
    expect(menuEffect("codex", cursor({ model: "gpt-5.5" }), { model: "", effort: "" })).toBe(
      "Switch to GPT-5.5 at its default level",
    );
  });

  it("reads a level pick on the running model as a level change", () => {
    const c = cursor({ column: "effort", model: "opus", effort: "xhigh" });
    expect(menuEffect("claude", c, { model: "opus", effort: "low" })).toBe(
      "Set level to Extra High, staying on Opus",
    );
  });

  it("reads a level pick on another model as a move to that model", () => {
    const c = cursor({ column: "effort", model: "fable", effort: "ultracode" });
    expect(menuEffect("claude", c, { model: "opus", effort: "low" })).toBe(
      "Switch to Fable at Ultracode",
    );
  });

  // With no known model, "staying on" would be a claim lpm can't make.
  it("never claims to stay on a model it doesn't know", () => {
    const c = cursor({ column: "effort", model: "opus", effort: "high" });
    expect(menuEffect("claude", c, { model: "", effort: "" })).toBe("Switch to Opus at High");
  });

  it("calls the running model's own row what it is, not a switch", () => {
    expect(menuEffect("claude", cursor(), { model: "opus", effort: "high" })).toBe(
      "Already running — pick a level to change it",
    );
  });

  // Claude keeps the level across a model switch only when the new model takes
  // it, and clamps silently when it doesn't — so promising "leaving the level
  // alone" on the way to Haiku would be false.
  it("warns when the model being switched to has no such level", () => {
    expect(menuEffect("claude", cursor({ model: "haiku" }), { model: "opus", effort: "ultracode" })).toBe(
      "Switch to Haiku — it has no Ultracode",
    );
    expect(menuEffect("claude", cursor({ model: "haiku" }), { model: "opus", effort: "high" })).toBe(
      "Switch to Haiku, leaving the level alone",
    );
  });

  it("says nothing when the level column has no row highlighted", () => {
    expect(menuEffect("claude", cursor({ column: "effort", effort: "" }), { model: "", effort: "" })).toBe("");
  });
});
