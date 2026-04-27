import { useMemo, useState } from "react";
import { getSettings, saveSettings } from "../settings";
import {
  type TerminalThemeName,
  terminalThemeNames,
  getTerminalThemeColors,
  terminalThemeCssVars,
} from "../terminal-themes";

const DEFAULT_THEME: TerminalThemeName = "claude-dark";

function readSavedTheme(): TerminalThemeName {
  const saved = getSettings().terminalTheme;
  return saved && terminalThemeNames.includes(saved as TerminalThemeName)
    ? (saved as TerminalThemeName)
    : DEFAULT_THEME;
}

export interface UseTerminalThemeResult {
  theme: TerminalThemeName;
  setTheme: (theme: TerminalThemeName) => void;
  themeStyle: React.CSSProperties | undefined;
}

// Tracks the user's terminal theme choice and exposes the CSS variables
// to apply. "default" is persisted as undefined so users can revert to
// the OS default by re-picking it.
export function useTerminalTheme(): UseTerminalThemeResult {
  const [theme, setThemeState] = useState<TerminalThemeName>(readSavedTheme);

  const setTheme = (next: TerminalThemeName) => {
    setThemeState(next);
    saveSettings({ terminalTheme: next === "default" ? undefined : next });
  };

  const themeStyle = useMemo(() => {
    const colors = getTerminalThemeColors(theme);
    return colors ? (terminalThemeCssVars(colors) as React.CSSProperties) : undefined;
  }, [theme]);

  return { theme, setTheme, themeStyle };
}
