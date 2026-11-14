import type { Settings } from "./store/settings";
import {
  isTerminalThemeName,
  terminalThemeAppearance,
  type TerminalAppearance,
  type TerminalThemeName,
} from "./terminal-themes";

// "single" draws every terminal in one theme; "follow" keeps a dark pick and a
// light pick and switches between them with the app's own light or dark.
export type TerminalThemeMode = "single" | "follow";

export const DEFAULT_TERMINAL_THEME: TerminalThemeName = "claude-dark";

export interface TerminalThemeChoice {
  mode: TerminalThemeMode;
  theme: TerminalThemeName;
  dark: TerminalThemeName;
  light: TerminalThemeName;
}

export type TerminalThemeSettings = Pick<
  Settings,
  "terminalTheme" | "terminalThemeMode" | "terminalThemeDark" | "terminalThemeLight"
>;

const COUNTERPARTS: Partial<Record<TerminalThemeName, TerminalThemeName>> = {
  "github-dark": "github-light",
  "github-light": "github-dark",
  "solarized-dark": "solarized-light",
  "solarized-light": "solarized-dark",
  "claude-dark": "claude-light",
  "claude-light": "claude-dark",
};

const FALLBACK: Record<TerminalAppearance, TerminalThemeName> = {
  dark: "claude-dark",
  light: "claude-light",
};

export function isTerminalThemeMode(value: unknown): value is TerminalThemeMode {
  return value === "single" || value === "follow";
}

export function terminalThemeOf(value: string | undefined): TerminalThemeName {
  return isTerminalThemeName(value) ? value : DEFAULT_TERMINAL_THEME;
}

// Default has no appearance of its own, so it fits either.
export function fitsAppearance(name: TerminalThemeName, appearance: TerminalAppearance): boolean {
  const own = terminalThemeAppearance(name);
  return own === null || own === appearance;
}

// Until a pick is made, the one theme carries over where it fits, and its
// light or dark twin, if it has one, where it doesn't.
function pickFor(
  appearance: TerminalAppearance,
  stored: string | undefined,
  single: TerminalThemeName,
): TerminalThemeName {
  if (isTerminalThemeName(stored)) return stored;
  if (fitsAppearance(single, appearance)) return single;
  return COUNTERPARTS[single] ?? FALLBACK[appearance];
}

export function terminalThemeChoiceOf(s: TerminalThemeSettings): TerminalThemeChoice {
  const theme = terminalThemeOf(s.terminalTheme);
  return {
    mode: s.terminalThemeMode === "follow" ? "follow" : "single",
    theme,
    dark: pickFor("dark", s.terminalThemeDark, theme),
    light: pickFor("light", s.terminalThemeLight, theme),
  };
}

export function resolveTerminalTheme(
  choice: TerminalThemeChoice,
  appearance: TerminalAppearance,
): TerminalThemeName {
  if (choice.mode === "single") return choice.theme;
  return appearance === "dark" ? choice.dark : choice.light;
}

// Choosing a theme: in Follow mode it becomes the pick for its own appearance,
// and Default, which has none, the pick for the one showing now.
export function themePickPatch(
  choice: TerminalThemeChoice,
  name: TerminalThemeName,
  showing: TerminalAppearance,
): Partial<TerminalThemeSettings> {
  if (choice.mode === "single") return { terminalTheme: name };
  const slot = terminalThemeAppearance(name) ?? showing;
  return slot === "dark" ? { terminalThemeDark: name } : { terminalThemeLight: name };
}

// Follow starts from the picks the grid shows; One theme keeps whichever theme
// the terminals show now.
export function themeModePatch(
  choice: TerminalThemeChoice,
  mode: TerminalThemeMode,
  showing: TerminalAppearance,
): Partial<TerminalThemeSettings> {
  if (mode === "follow") {
    return { terminalThemeMode: "follow", terminalThemeDark: choice.dark, terminalThemeLight: choice.light };
  }
  return { terminalThemeMode: "single", terminalTheme: resolveTerminalTheme(choice, showing) };
}
