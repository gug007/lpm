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
  // The imported theme keeps its name when its colors change.
  const imported = useSettingsStore((s) => s.terminalImportedTheme);

  const themeStyle = useMemo(() => {
    const colors = getTerminalThemeColors(theme);
    return colors ? (terminalThemeCssVars(colors) as React.CSSProperties) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, imported]);

  return { theme, themeStyle };
}
