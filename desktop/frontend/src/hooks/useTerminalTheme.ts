import { useMemo } from "react";
import { useSettingsStore } from "../store/settings";
import { useResolvedTheme } from "../theme";
import {
  type TerminalThemeName,
  getTerminalThemeColors,
  terminalThemeCssVars,
} from "../terminal-themes";
import { resolveTerminalTheme, terminalThemeChoiceOf } from "../terminalThemeChoice";

export interface UseTerminalThemeResult {
  theme: TerminalThemeName;
  themeStyle: React.CSSProperties | undefined;
}

// The theme terminals are drawn in now: the one theme, or in Follow mode the
// pick for the app's current light or dark.
export function useTerminalTheme(): UseTerminalThemeResult {
  const appearance = useResolvedTheme();
  const theme = useSettingsStore((s) => resolveTerminalTheme(terminalThemeChoiceOf(s), appearance));

  const themeStyle = useMemo(() => {
    const colors = getTerminalThemeColors(theme);
    return colors ? (terminalThemeCssVars(colors) as React.CSSProperties) : undefined;
  }, [theme]);

  return { theme, themeStyle };
}
