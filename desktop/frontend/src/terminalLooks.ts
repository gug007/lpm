import type { TerminalLook } from "./components/settings/machineCommands";
import { steppedTerminalFontSize } from "./hooks/useTerminalFontSize";
import { importedThemeColors, type ImportedTerminalTheme } from "./importedTheme";
import type { Settings } from "./store/settings";
import type { TerminalAppearance } from "./terminal-themes";
import type { TerminalThemeChoice } from "./terminalThemeChoice";

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// The installed family a terminal names: as written, or for iTerm2's own font
// names ("MesloLGS-NF-Regular") the family they belong to ("MesloLGS NF").
export function resolveFontFamily(name: string | undefined, installed: readonly string[]): string | null {
  if (!name) return null;
  const exact = installed.find((f) => f.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  const parts = name.split("-");
  for (let n = parts.length; n > 0; n--) {
    const wanted = squash(parts.slice(0, n).join(""));
    const hit = installed.find((f) => squash(f) === wanted);
    if (hit) return hit;
  }
  return null;
}

function lookTheme(look: TerminalLook): ImportedTerminalTheme | null {
  const c = look.colors;
  if (!c) return null;
  return {
    name: look.themeName ? `${look.app} · ${look.themeName}` : look.app,
    bg: c.background,
    fg: c.foreground,
    cursor: c.cursor,
    selection: c.selection,
    ansi: c.ansi,
  };
}

// "JetBrains Mono 13 · Catppuccin Mocha", as the row describes it.
export function lookSummary(look: TerminalLook, family: string | null): string {
  const font = family ?? look.fontFamily;
  const parts = [
    [font, look.fontSize].filter(Boolean).join(" "),
    look.themeName ?? (look.colors ? "its colors" : ""),
  ].filter(Boolean);
  return parts.join(" · ");
}

// What "Use this look" changes: the font when it is installed here, the size,
// and the colors as the imported theme, picked where the theme choice keeps it.
export function lookPatch(
  look: TerminalLook,
  installed: readonly string[],
  choice: TerminalThemeChoice,
): Partial<Settings> {
  const patch: Partial<Settings> = {};
  const family = resolveFontFamily(look.fontFamily, installed);
  if (family) patch.terminalFontFamily = family;
  if (look.fontSize) {
    patch.terminalFontSize = steppedTerminalFontSize(Math.round(look.fontSize), 0);
  }
  const theme = lookTheme(look);
  if (theme) {
    patch.terminalImportedTheme = theme;
    const slot: TerminalAppearance = importedThemeColors(theme).appearance;
    if (choice.mode === "single") patch.terminalTheme = "imported";
    else if (slot === "dark") patch.terminalThemeDark = "imported";
    else patch.terminalThemeLight = "imported";
  }
  return patch;
}

// The settings a patch replaces, to put back with Undo.
export function previousOf(patch: Partial<Settings>, settings: Settings): Partial<Settings> {
  return Object.fromEntries(Object.keys(patch).map((k) => [k, settings[k as keyof Settings]])) as Partial<Settings>;
}
