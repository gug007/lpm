import { describe, expect, it } from "vitest";
import {
  getTerminalThemeColors,
  terminalThemeAppearance,
  terminalThemeLabel,
  terminalThemeNames,
  terminalXtermTheme,
} from "./terminal-themes";
import { ansiColors } from "./components/terminal-colors";
import {
  resolveTerminalTheme,
  terminalThemeChoiceOf,
  themeModePatch,
  themePickPatch,
} from "./terminalThemeChoice";

describe("terminalThemeChoiceOf", () => {
  it("keeps an existing config as one theme, unchanged", () => {
    const choice = terminalThemeChoiceOf({ terminalTheme: "dracula" });
    expect(choice.mode).toBe("single");
    expect(resolveTerminalTheme(choice, "dark")).toBe("dracula");
    expect(resolveTerminalTheme(choice, "light")).toBe("dracula");
  });

  it("falls back to Claude Dark for a missing or unknown theme", () => {
    expect(terminalThemeChoiceOf({}).theme).toBe("claude-dark");
    expect(terminalThemeChoiceOf({ terminalTheme: "sepia" }).theme).toBe("claude-dark");
  });

  it("follows the app between the dark and light picks", () => {
    const choice = terminalThemeChoiceOf({
      terminalTheme: "nord",
      terminalThemeMode: "follow",
      terminalThemeDark: "dracula",
      terminalThemeLight: "github-light",
    });
    expect(resolveTerminalTheme(choice, "dark")).toBe("dracula");
    expect(resolveTerminalTheme(choice, "light")).toBe("github-light");
  });

  it("fills unset picks from the one theme and its light or dark twin", () => {
    expect(terminalThemeChoiceOf({ terminalTheme: "claude-dark" })).toMatchObject({
      dark: "claude-dark",
      light: "claude-light",
    });
    expect(terminalThemeChoiceOf({ terminalTheme: "solarized-light" })).toMatchObject({
      dark: "solarized-dark",
      light: "solarized-light",
    });
    expect(terminalThemeChoiceOf({ terminalTheme: "monokai" })).toMatchObject({
      dark: "monokai",
      light: "claude-light",
    });
    expect(terminalThemeChoiceOf({ terminalTheme: "default" })).toMatchObject({
      dark: "default",
      light: "default",
    });
  });

  it("ignores an unknown pick", () => {
    const choice = terminalThemeChoiceOf({
      terminalTheme: "github-dark",
      terminalThemeMode: "follow",
      terminalThemeLight: "nope",
    });
    expect(choice.light).toBe("github-light");
  });
});

describe("themePickPatch", () => {
  const single = terminalThemeChoiceOf({ terminalTheme: "nord" });
  const follow = terminalThemeChoiceOf({ terminalTheme: "nord", terminalThemeMode: "follow" });

  it("sets the one theme in One theme mode, light or dark", () => {
    expect(themePickPatch(single, "github-light", "dark")).toEqual({ terminalTheme: "github-light" });
  });

  it("sets the pick for the theme's own appearance in Follow mode", () => {
    expect(themePickPatch(follow, "dracula", "light")).toEqual({ terminalThemeDark: "dracula" });
    expect(themePickPatch(follow, "claude-light", "dark")).toEqual({ terminalThemeLight: "claude-light" });
  });

  it("gives Default the pick for the appearance showing now", () => {
    expect(themePickPatch(follow, "default", "dark")).toEqual({ terminalThemeDark: "default" });
    expect(themePickPatch(follow, "default", "light")).toEqual({ terminalThemeLight: "default" });
  });
});

describe("themeModePatch", () => {
  it("writes both picks when Follow is turned on", () => {
    const choice = terminalThemeChoiceOf({ terminalTheme: "github-dark" });
    expect(themeModePatch(choice, "follow", "dark")).toEqual({
      terminalThemeMode: "follow",
      terminalThemeDark: "github-dark",
      terminalThemeLight: "github-light",
    });
  });

  it("keeps the theme showing now when going back to one theme", () => {
    const choice = terminalThemeChoiceOf({
      terminalTheme: "nord",
      terminalThemeMode: "follow",
      terminalThemeDark: "dracula",
      terminalThemeLight: "claude-light",
    });
    expect(themeModePatch(choice, "single", "light")).toEqual({
      terminalThemeMode: "single",
      terminalTheme: "claude-light",
    });
  });
});

describe("terminal themes", () => {
  it("names every theme", () => {
    expect(terminalThemeNames.map(terminalThemeLabel)).toEqual([
      "Default",
      "One Dark",
      "Monokai",
      "Dracula",
      "Nord",
      "Solarized Dark",
      "GitHub Dark",
      "Claude Dark",
      "GitHub Light",
      "Solarized Light",
      "Claude Light",
    ]);
  });

  it("gives light themes their own ANSI colors", () => {
    for (const name of ["github-light", "solarized-light", "claude-light"] as const) {
      expect(terminalThemeAppearance(name)).toBe("light");
      const theme = terminalXtermTheme(getTerminalThemeColors(name)!);
      expect(theme.green).not.toBe(ansiColors.green);
      expect(theme.brightWhite).not.toBe(theme.background);
    }
    expect(terminalXtermTheme(getTerminalThemeColors("dracula")!).green).toBe(ansiColors.green);
    expect(terminalThemeAppearance("default")).toBeNull();
  });
});
