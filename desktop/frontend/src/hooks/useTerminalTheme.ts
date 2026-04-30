import { useEffect, useMemo, useState } from "react";
import { getSettings, saveSettings } from "../settings";
import {
  type TerminalThemeName,
  terminalThemeNames,
  getTerminalThemeColors,
  terminalThemeCssVars,
} from "../terminal-themes";
import {
  TERMINAL_SETTINGS_CHANGED_EVENT,
  notifyTerminalSettingsChanged,
} from "./terminalSettingsEvents";

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
// the OS default by re-picking it. Awaits the save before broadcasting
// so peer hooks read the fresh cached value.
export function useTerminalTheme(): UseTerminalThemeResult {
  const [theme, setThemeState] = useState<TerminalThemeName>(readSavedTheme);

  const setTheme = async (next: TerminalThemeName) => {
    setThemeState(next);
    await saveSettings({ terminalTheme: next });
    notifyTerminalSettingsChanged();
  };

  useEffect(() => {
    const sync = () => {
      const next = readSavedTheme();
      setThemeState((cur) => (cur === next ? cur : next));
    };
    window.addEventListener(TERMINAL_SETTINGS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TERMINAL_SETTINGS_CHANGED_EVENT, sync);
  }, []);

  const themeStyle = useMemo(() => {
    const colors = getTerminalThemeColors(theme);
    return colors ? (terminalThemeCssVars(colors) as React.CSSProperties) : undefined;
  }, [theme]);

  return { theme, setTheme, themeStyle };
}
