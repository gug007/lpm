import { describe, expect, it } from "vitest";
import { AI_CLI_OPTIONS } from "./types";
import {
  claudeSwitchCommand,
  codexChangeBanners,
  codexCurrentPick,
  codexPickerView,
  effortValueOf,
  findEffortRow,
  findModelRow,
  findMoreEffortsRow,
  moveKeys,
  pickSummary,
  switchableCLI,
  switchEffectiveEffort,
  switchEffortUnion,
  switchEfforts,
  switchModels,
} from "./agentModelSwitch";

// Captured from a real `codex` pane (v0.154.0) with the ANSI stripped, the way
// captureInteractivePaneLog hands it over.
const MODEL_SCREEN = `╭────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.154.0)                     │
│ model:     gpt-6-astra low   /model to change  │
╰────────────────────────────────────────────────╯

  Select Model and Effort
  Access legacy models by running codex -m <model_name> or in your config.toml

› 1. gpt-6-astra (current)  Our most capable model for complex, demanding work.
  2. gpt-5.6-sol            Reliable agentic workhorse for everyday tasks.
  3. gpt-5.6-terra          Balanced agentic coding model for everyday work.
  4. gpt-5.6-luna           Fast and affordable agentic coding model.
  5. gpt-5.5                Proven previous-generation model for coding and general work.

  Press enter to confirm or esc to go back`;

const EFFORT_SCREEN = `  Select Reasoning Level for gpt-5.6-terra

  1. Low               Fast responses with lighter reasoning
› 2. Medium (default)  Balances speed and reasoning depth for everyday tasks
  3. High              Greater reasoning depth for complex problems
  4. Extra high        Extra high reasoning depth for complex problems
  5. More reasoning…   Max and Ultra consume usage limits faster

  Press enter to confirm or esc to go back`;

// The banner names an older switch than the status line does, so a reading that
// confuses the transcript's history for live state is visible in the result.
const IDLE_SCREEN = `• Model changed to gpt-5.5 low

› Ask Codex to do anything

  gpt-5.6-terra medium · Context 100% left · 5h 73% left · weekly 64% left · Fast off`;

describe("switchableCLI", () => {
  it("accepts only the CLIs that can be switched mid-session", () => {
    expect(switchableCLI("claude")).toBe("claude");
    expect(switchableCLI("codex")).toBe("codex");
    expect(switchableCLI("gemini")).toBeNull();
    expect(switchableCLI("opencode")).toBeNull();
    expect(switchableCLI(null)).toBeNull();
  });
});

describe("switchModels / switchEfforts", () => {
  it("drops the launch-time Default model, which no command can restore", () => {
    expect(switchModels("claude").map((m) => m.value)).toEqual([
      "fable",
      "opus",
      "sonnet",
      "haiku",
    ]);
    expect(switchModels("codex").some((m) => m.value === "")).toBe(false);
  });

  it("keeps Claude's default slot as the /effort auto it really is", () => {
    const efforts = switchEfforts("claude", "opus");
    expect(efforts[0]).toEqual({ value: "auto", label: "Auto" });
    expect(efforts.some((e) => e.value === "")).toBe(false);
  });

  // Slash-command only: `claude --effort` takes neither, so the launch-time list
  // in types.ts must not grow them.
  it("offers ultracode on the models Claude orchestrates with, and nowhere else", () => {
    for (const model of ["fable", "sonnet", "opus"]) {
      const efforts = switchEfforts("claude", model).map((e) => e.value);
      expect(efforts).toContain("ultracode");
      expect(efforts[efforts.length - 1]).toBe("ultracode");
    }
    expect(switchEfforts("claude", "haiku").map((e) => e.value)).not.toContain("ultracode");
    expect(switchEfforts("codex", "gpt-6-astra").map((e) => e.value)).not.toContain("ultracode");
  });

  // Claude's effort list became model-dependent when ultracode arrived, so a
  // level carried across a model switch can now be one the new model rejects.
  it("drops a carried-over level the new model doesn't take", () => {
    expect(switchEffectiveEffort("claude", "haiku", "ultracode")).toBe("");
    expect(switchEffectiveEffort("claude", "fable", "ultracode")).toBe("ultracode");
    expect(switchEffectiveEffort("claude", "haiku", "xhigh")).toBe("xhigh");
    expect(switchEffectiveEffort("claude", "opus", "")).toBe("");
    expect(switchEffectiveEffort("codex", "gpt-5.5", "ultra")).toBe("");
  });

  // The menu renders this union and greys out what the highlighted model can't
  // take, so its height doesn't change as the highlight moves.
  it("unions every level a CLI's models offer, in menu order", () => {
    expect(switchEffortUnion("claude").map((e) => e.value)).toEqual([
      "auto",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultracode",
    ]);
    const codex = switchEffortUnion("codex").map((e) => e.value);
    expect(codex).toContain("ultra");
    expect(codex).toContain("max");
    expect(new Set(codex).size).toBe(codex.length);
  });

  it("keeps ultracode and auto out of the launch-time efforts that feed --effort", () => {
    const launch = AI_CLI_OPTIONS.find((o) => o.value === "claude")?.efforts ?? [];
    expect(launch.map((e) => e.value)).toEqual(["", "low", "medium", "high", "xhigh", "max"]);
  });

  it("drops Codex's empty effort and keeps the per-model top levels", () => {
    expect(switchEfforts("codex", "gpt-5.5").map((e) => e.value)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(switchEfforts("codex", "gpt-6-astra").map((e) => e.value)).toContain("ultra");
  });
});

describe("pickSummary", () => {
  it("reads out whichever halves are known", () => {
    expect(pickSummary("claude", { model: "opus", effort: "high" })).toBe("Opus · High");
    expect(pickSummary("claude", { model: "opus", effort: "" })).toBe("Opus");
    expect(pickSummary("codex", { model: "", effort: "" })).toBe("");
  });
});

describe("claudeSwitchCommand", () => {
  it("builds the one-shot slash commands", () => {
    expect(claudeSwitchCommand("model", "opus")).toBe("/model opus");
    expect(claudeSwitchCommand("effort", "xhigh")).toBe("/effort xhigh");
  });
});

describe("codexPickerView", () => {
  it("reads the model list, its cursor and the current model", () => {
    const view = codexPickerView(MODEL_SCREEN);
    expect(view?.kind).toBe("model");
    expect(view?.rows.map((r) => r.label)).toEqual([
      "gpt-6-astra",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
    ]);
    expect(view?.rows[0]).toMatchObject({ index: 1, selected: true, current: true });
    expect(view?.rows[1].selected).toBe(false);
  });

  it("reads the effort list and the model it belongs to", () => {
    const view = codexPickerView(EFFORT_SCREEN);
    expect(view?.kind).toBe("effort");
    expect(view?.model).toBe("gpt-5.6-terra");
    expect(view?.rows.map((r) => r.label)).toEqual([
      "Low",
      "Medium",
      "High",
      "Extra high",
      "More reasoning…",
    ]);
    expect(view?.rows[1].selected).toBe(true);
  });

  it("walks a list whose header it doesn't recognize", () => {
    const view = codexPickerView(`  Even more reasoning

  1. Max    Deeper still
› 2. Ultra  Deepest

  Press enter to confirm or esc to go back`);
    expect(view?.kind).toBe("other");
    expect(findEffortRow(view?.rows ?? [], "ultra")?.index).toBe(2);
  });

  it("returns null when no picker is open", () => {
    expect(codexPickerView(IDLE_SCREEN)).toBeNull();
    expect(codexPickerView("")).toBeNull();
  });

  it("returns null when the footer has no rows above it", () => {
    expect(codexPickerView("nothing here\n\n  Press enter to confirm or esc to go back")).toBeNull();
  });

  // At a narrow width a row's description wraps onto its own line. Stopping the
  // scan there would drop every row above it, and the driver would report the
  // model as one Codex doesn't offer.
  it("keeps the rows above a wrapped description line", () => {
    const view = codexPickerView(`  Select Model and Effort

› 1. gpt-6-astra (current)  Our most capable model for
       complex, demanding work.
  2. gpt-5.6-sol            Reliable agentic workhorse.

  Press enter to confirm or esc to go back`);
    expect(view?.rows.map((r) => r.label)).toEqual(["gpt-6-astra", "gpt-5.6-sol"]);
    expect(view?.kind).toBe("model");
  });

  // Codex reuses the footer for its other pickers; walking one of those as if it
  // were the model list would confirm an unrelated setting.
  it("does not read another Codex picker as the model list", () => {
    const view = codexPickerView(`  Select Permission Profile

› 1. Read only    Codex asks before writing
  2. YOLO mode    No prompts at all

  Press enter to confirm or esc to go back`);
    expect(view?.kind).toBe("other");
  });
});

describe("row lookup", () => {
  const models = codexPickerView(MODEL_SCREEN)?.rows ?? [];
  const efforts = codexPickerView(EFFORT_SCREEN)?.rows ?? [];

  it("finds a model row by slug and misses one the picker doesn't list", () => {
    expect(findModelRow(models, "gpt-5.6-luna")?.index).toBe(4);
    expect(findModelRow(models, "gpt-5.3-codex")).toBeNull();
  });

  it("maps Codex's level names onto the flag values", () => {
    expect(effortValueOf("Extra high")).toBe("xhigh");
    expect(effortValueOf("medium")).toBe("medium");
    expect(effortValueOf("More reasoning…")).toBeNull();
    expect(findEffortRow(efforts, "xhigh")?.index).toBe(4);
    expect(findEffortRow(efforts, "ultra")).toBeNull();
    expect(findMoreEffortsRow(efforts)?.index).toBe(5);
  });
});

describe("moveKeys", () => {
  const rows = codexPickerView(EFFORT_SCREEN)?.rows ?? [];

  it("walks down, walks up, and stays put", () => {
    expect(moveKeys(rows, rows[4])).toBe("\x1b[B".repeat(3));
    expect(moveKeys(rows, rows[0])).toBe("\x1b[A");
    expect(moveKeys(rows, rows[1])).toBe("");
  });

  it("refuses to guess when the list shows no cursor", () => {
    expect(moveKeys(rows.map((r) => ({ ...r, selected: false })), rows[0])).toBeNull();
  });
});

describe("codexCurrentPick", () => {
  it("reads the live status line, not the transcript's switch history", () => {
    expect(codexCurrentPick(IDLE_SCREEN)).toEqual({ model: "gpt-5.6-terra", effort: "medium" });
  });

  // lpm's own default Codex status line: model-with-reasoning, then the
  // directory — nothing fixed after the level, so the model is found as a
  // segment wherever it sits.
  it("reads lpm's default Codex status line, with or without the level item", () => {
    expect(codexCurrentPick("  gpt-6-astra low · ~/Projects/karucapatoxic")).toEqual({
      model: "gpt-6-astra",
      effort: "low",
    });
    expect(codexCurrentPick("  gpt-5.3-codex · ~/Projects/x")).toEqual({
      model: "gpt-5.3-codex",
      effort: "",
    });
    expect(codexCurrentPick("  ~/Projects/x · main · gpt-6-astra high · 80% left")).toEqual({
      model: "gpt-6-astra",
      effort: "high",
    });
  });

  it("does not take a git branch or run state for a model", () => {
    expect(codexCurrentPick("  ~/Projects/x · main · Working")).toBeNull();
    expect(codexCurrentPick("  Ready · main")).toBeNull();
  });

  it("falls back to the welcome box when the status line is configured off", () => {
    expect(codexCurrentPick("│ model:     gpt-6-astra low   /model to change  │")).toEqual({
      model: "gpt-6-astra",
      effort: "low",
    });
  });

  it("takes the lowest status line when the viewport holds more than one", () => {
    expect(
      codexCurrentPick("  gpt-5.5 high · Context 90% left\n  gpt-6-astra max · Context 80% left"),
    ).toEqual({ model: "gpt-6-astra", effort: "max" });
  });

  it("is null when the screen says nothing about the model", () => {
    expect(codexCurrentPick("› Ask Codex to do anything")).toBeNull();
    expect(codexCurrentPick("")).toBeNull();
  });

  // The readouts are only trustworthy because they are matched with the chrome
  // around them; agent output that merely talks about models must read as
  // "unknown" rather than as a confident wrong answer.
  it("ignores transcript prose that happens to mention a model", () => {
    expect(codexCurrentPick("The model: gpt-5.5 is a good default for this repo.")).toBeNull();
    expect(codexCurrentPick("  model: sonnet")).toBeNull();
    expect(codexCurrentPick("I switched the model high above the Context of that file")).toBeNull();
    expect(codexCurrentPick("Model changed to gpt-6-astra max")).toBeNull();
  });
});

describe("codexChangeBanners", () => {
  it("lists every confirmation banner, oldest first", () => {
    expect(
      codexChangeBanners("• Model changed to gpt-5.5 low\n\n• Model changed to gpt-6-astra max"),
    ).toEqual([
      { model: "gpt-5.5", effort: "low" },
      { model: "gpt-6-astra", effort: "max" },
    ]);
  });

  it("reads a banner with no level", () => {
    expect(codexChangeBanners("• Model changed to gpt-5.4")).toEqual([
      { model: "gpt-5.4", effort: "" },
    ]);
  });

  it("ignores prose that only quotes the phrase mid-line", () => {
    expect(codexChangeBanners("I see the model changed to something else partway through")).toEqual(
      [],
    );
    expect(codexChangeBanners("Because Model changed to gpt-5.5 low, the run restarted")).toEqual(
      [],
    );
  });
});
