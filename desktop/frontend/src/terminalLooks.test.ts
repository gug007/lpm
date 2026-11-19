import { describe, expect, it } from "vitest";
import type { TerminalLook } from "./components/settings/machineCommands";
import { lookPatch, lookSummary, resolveFontFamily } from "./terminalLooks";
import type { TerminalThemeChoice } from "./terminalThemeChoice";

const single: TerminalThemeChoice = { mode: "single", theme: "claude-dark", dark: "claude-dark", light: "claude-light" };
const follow: TerminalThemeChoice = { ...single, mode: "follow" };
const ansi = Array.from({ length: 16 }, () => "");

describe("resolveFontFamily", () => {
  const installed = ["Menlo", "MesloLGS NF", "JetBrains Mono"];
  it("finds a family as written or from iTerm2's font name", () => {
    expect(resolveFontFamily("jetbrains mono", installed)).toBe("JetBrains Mono");
    expect(resolveFontFamily("MesloLGS-NF-Regular", installed)).toBe("MesloLGS NF");
    expect(resolveFontFamily("JetBrainsMono-Bold", installed)).toBe("JetBrains Mono");
  });
  it("is nothing for a font that isn't installed", () => {
    expect(resolveFontFamily("Iosevka", installed)).toBeNull();
    expect(resolveFontFamily(undefined, installed)).toBeNull();
  });
});

describe("lookPatch", () => {
  const dark: TerminalLook = {
    app: "Ghostty",
    fontFamily: "JetBrains Mono",
    fontSize: 13.4,
    themeName: "Catppuccin Mocha",
    colors: { background: "#1e1e2e", foreground: "#cdd6f4", ansi },
  };

  it("brings the font, its size and the colors as the imported theme", () => {
    expect(lookPatch(dark, ["JetBrains Mono"], single)).toEqual({
      terminalFontFamily: "JetBrains Mono",
      terminalFontSize: 13,
      terminalImportedTheme: { name: "Ghostty · Catppuccin Mocha", bg: "#1e1e2e", fg: "#cdd6f4", ansi },
      terminalTheme: "imported",
    });
  });

  it("leaves out a font that isn't installed and fills the matching follow slot", () => {
    const light = { ...dark, colors: { background: "#ffffff", foreground: "#222222", ansi } };
    const patch = lookPatch(light, [], follow);
    expect(patch.terminalFontFamily).toBeUndefined();
    expect(patch.terminalThemeLight).toBe("imported");
    expect(patch.terminalTheme).toBeUndefined();
  });

  it("describes the look", () => {
    expect(lookSummary(dark, "JetBrains Mono")).toBe("JetBrains Mono 13.4 · Catppuccin Mocha");
    expect(lookSummary({ app: "iTerm2", fontFamily: "Menlo-Regular", fontSize: 12, colors: dark.colors }, null)).toBe(
      "Menlo-Regular 12 · its colors",
    );
  });
});
