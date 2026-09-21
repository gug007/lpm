import { describe, expect, it } from "vitest";
import { claudeCurrentPick, claudeModelValue, claudeRefusals, claudeUltracodeMark } from "./claudeReadback";

// The composer Claude Code 2.1.278 draws: a rule, the prompt, a rule. The top
// rule carries the ultracode label when the session is pinned to it.
const RULE = "─".repeat(96);
const composer = (label = "") => [`${RULE}${label ? ` ${label} ─` : ""}`, "❯ ", RULE].join("\n");

describe("claudeCurrentPick", () => {
  // The welcome banner, as Claude Code draws it beside the logo's block glyphs.
  it("reads model and level from the welcome banner", () => {
    expect(claudeCurrentPick("  Fable 5.1 with high effort · Claude Max\n  ~/Projects/x")).toEqual({
      model: "fable",
      effort: "high",
    });
    expect(claudeCurrentPick("▝▜██████▀  Fable 5.1 with xhigh effort · Claude Max")).toEqual({
      model: "fable",
      effort: "xhigh",
    });
  });

  // A model with a variant note reads as its family all the same — before this,
  // "(1M context)" ended the match and the pane named neither half.
  it("steps over the variant note a model's name can carry", () => {
    expect(
      claudeCurrentPick("▝▜██████▀  Opus 5 (1M context) with xhigh effort · Claude Max"),
    ).toEqual({ model: "opus", effort: "xhigh" });
    expect(claudeCurrentPick("— lpm · Opus 5 (1M context) · ctx 83% · $0.04")).toEqual({
      model: "opus",
      effort: "",
    });
  });

  // lpm's own status line — live at the bottom, so it outranks the banner.
  it("takes the model from the status line and the level from the banner", () => {
    const screen = [
      "  Opus 4.7 with high effort · Claude Max",
      "",
      "— karucapatoxic · Fable 5.1 · $0.00",
      "▶▶ auto mode on (shift+tab to cycle) · ← 1 agent",
    ].join("\n");
    expect(claudeCurrentPick(screen)).toEqual({ model: "fable", effort: "high" });
  });

  it("reads the status line with the model as its first segment too", () => {
    expect(claudeCurrentPick("— Fable 5.1 · $0.00 · main")).toEqual({ model: "fable", effort: "" });
    expect(claudeCurrentPick("Opus 4.7 · ~/Projects/x")).toEqual({ model: "opus", effort: "" });
  });

  it("follows the confirmations /model and /effort print, in either phrasing", () => {
    expect(claudeCurrentPick("Set model to `Fable 5.1` and saved as your default for new sessions")).toEqual({
      model: "fable",
      effort: "",
    });
    expect(claudeCurrentPick("Model set to Opus 4.7 (session-scoped, not persisted)")).toEqual({
      model: "opus",
      effort: "",
    });
    expect(
      claudeCurrentPick("Set effort level to xhigh (saved as your default for new sessions): Deeper"),
    ).toEqual({ model: "", effort: "xhigh" });
    expect(claudeCurrentPick("Effort set to max and saved as your default")).toEqual({
      model: "",
      effort: "max",
    });
    expect(claudeCurrentPick("Effort level set to auto for this session")).toEqual({
      model: "",
      effort: "auto",
    });
  });

  // Claude prints a slash command's answer as a tool result, under the elbow —
  // which is not whitespace, and used to end the reading before it began.
  it("reads a confirmation printed under the result elbow", () => {
    expect(
      claudeCurrentPick(
        "❯ /effort low\n  ⎿  Set effort level to low (saved as your default for new sessions): Quick",
      ),
    ).toEqual({ model: "", effort: "low" });
    expect(claudeCurrentPick("  ⎿  Effort level set to auto")).toEqual({
      model: "",
      effort: "auto",
    });
    expect(claudeCurrentPick("  ⎿  Set model to `Opus 5` for this session")).toEqual({
      model: "opus",
      effort: "",
    });
  });

  // The chip above the composer, which fades after a few seconds — the glyph
  // differs per level, so the command beside the word is what anchors it.
  it("reads the level chip Claude shows after a change", () => {
    expect(claudeCurrentPick("                    ◉ xhigh · /effort")).toEqual({
      model: "",
      effort: "xhigh",
    });
    expect(claudeCurrentPick("  ○ low · /effort")).toEqual({ model: "", effort: "low" });
  });

  it("lets a later confirmation override the banner", () => {
    const screen = "  Fable 5.1 with high effort · Claude Max\n\nSet effort level to ultracode (this session only): xhigh";
    expect(claudeCurrentPick(screen)).toEqual({ model: "fable", effort: "ultracode" });
  });

  // Every other readout names the level ultracode runs *at*, so the banner and
  // the transcript both say xhigh while the session is on ultracode.
  it("takes the ultracode label over a reading that says xhigh", () => {
    const screen = [
      "▝▜██████▀  Opus 5 with xhigh effort · Claude Max",
      "",
      composer("ultracode"),
    ].join("\n");
    expect(claudeCurrentPick(screen)).toEqual({ model: "opus", effort: "ultracode" });
  });

  // The composer is redrawn in place, so every frame it was ever drawn in stays
  // in scrollback — labels and all. Only the live one states anything.
  it("looks for the label in the viewport, not in scrollback", () => {
    const scrollback = [composer("ultracode"), "  ⎿  Set effort level to high", composer()].join("\n");
    expect(claudeCurrentPick(scrollback, composer())).toEqual({ model: "", effort: "high" });
    expect(claudeCurrentPick(scrollback, composer("ultracode"))).toEqual({
      model: "",
      effort: "ultracode",
    });
  });

  // Only the elbow may precede a confirmation: anything non-letter would make
  // an agent writing *about* levels read as one having been set.
  it("ignores prose that merely writes a level or a model", () => {
    expect(claudeCurrentPick("**Set effort level to max** is what I would do here.")).toBeNull();
    expect(claudeCurrentPick("- Set effort level to high for the refactor")).toBeNull();
    expect(claudeCurrentPick("> Effort set to max, per the runbook")).toBeNull();
    expect(claudeCurrentPick("I'd recommend Opus 4.7 for this — it handles long refactors well.")).toBeNull();
    expect(claudeCurrentPick("the model set to use here is unclear")).toBeNull();
    expect(claudeCurrentPick("")).toBeNull();
  });
});

describe("claudeUltracodeMark", () => {
  it("finds the label on the composer's rule", () => {
    expect(claudeUltracodeMark(composer("ultracode"))).toBe(true);
    expect(claudeUltracodeMark(composer())).toBe(false);
    expect(claudeUltracodeMark("❯ /effort ultracode")).toBe(false);
    expect(claudeUltracodeMark("")).toBe(false);
  });
});

describe("claudeModelValue", () => {
  it("maps a transcript's model id to the row lpm pins", () => {
    expect(claudeModelValue("claude-opus-5")).toBe("opus");
    expect(claudeModelValue("claude-opus-5[1m]")).toBe("opus");
    expect(claudeModelValue("claude-fable-5-1")).toBe("fable");
    expect(claudeModelValue("claude-haiku-4-5-20251001")).toBe("haiku");
    expect(claudeModelValue("<synthetic>")).toBe("");
    expect(claudeModelValue("")).toBe("");
  });
});

describe("claudeRefusals", () => {
  it("counts the usage line Claude answers a rejected pick with", () => {
    expect(claudeRefusals("Usage: /model <name>. Available: sonnet, opus")).toBe(1);
    expect(claudeRefusals("  Usage: /effort <low|high>\n\n  Usage: /model <name>")).toBe(2);
  });

  it("does not count prose about the commands", () => {
    expect(claudeRefusals("Run /model to switch, or see Usage: below")).toBe(0);
    expect(claudeRefusals("")).toBe(0);
  });
});
