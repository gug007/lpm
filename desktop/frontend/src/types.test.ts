import { describe, it, expect } from "vitest";
import { aiEffectiveEffort, aiEfforts, aiSupportsFast } from "./types";

const values = (cli: "claude" | "codex" | "gemini", model: string) =>
  aiEfforts(cli, model).map((e) => e.value);

describe("aiEfforts", () => {
  it("offers Codex's top two levels only on the models that take them", () => {
    expect(values("codex", "gpt-5.6-sol")).toContain("ultra");
    expect(values("codex", "gpt-5.6-terra")).toContain("ultra");
    expect(values("codex", "gpt-5.6-luna")).toContain("max");
    expect(values("codex", "gpt-5.6-luna")).not.toContain("ultra");
    expect(values("codex", "gpt-5.5")).not.toContain("max");
  });

  it("keeps an unpinned Codex model on the levels every model shares", () => {
    expect(values("codex", "")).toEqual(["", "low", "medium", "high", "xhigh"]);
  });

  it("gives every Claude model the same levels", () => {
    expect(values("claude", "")).toEqual(values("claude", "haiku"));
    expect(values("claude", "opus")).toContain("max");
    expect(values("claude", "opus")).not.toContain("ultra");
  });

  it("has nothing for CLIs without an effort control", () => {
    expect(values("gemini", "")).toEqual([]);
  });
});

describe("aiSupportsFast", () => {
  it("offers Fast Mode on the flagship Codex models", () => {
    expect(aiSupportsFast("codex", "gpt-5.6-sol")).toBe(true);
    expect(aiSupportsFast("codex", "gpt-5.6-terra")).toBe(true);
    expect(aiSupportsFast("codex", "gpt-5.6-luna")).toBe(true);
    expect(aiSupportsFast("codex", "gpt-5.5")).toBe(true);
    expect(aiSupportsFast("codex", "gpt-5.4")).toBe(true);
  });

  it("withholds it from the smaller models, an unpinned pick, and other CLIs", () => {
    expect(aiSupportsFast("codex", "gpt-5.4-mini")).toBe(false);
    expect(aiSupportsFast("codex", "")).toBe(false);
    expect(aiSupportsFast("claude", "opus")).toBe(false);
  });
});

describe("aiEffectiveEffort", () => {
  it("keeps a level the model accepts", () => {
    expect(aiEffectiveEffort("codex", "gpt-5.6-sol", "ultra")).toBe("ultra");
  });

  it("falls back to the model default when the level would fail the run", () => {
    expect(aiEffectiveEffort("codex", "gpt-5.6-luna", "ultra")).toBe("");
    expect(aiEffectiveEffort("codex", "gpt-5.5", "max")).toBe("");
    expect(aiEffectiveEffort("claude", "opus", "ultra")).toBe("");
  });
});
