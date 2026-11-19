import type { ITheme } from "@xterm/xterm";
import { DARK_HOVER, LIGHT_HOVER, ansiColors } from "./components/terminal-colors";
import { importedThemeColors, isImportedTheme, type ImportedTerminalTheme } from "./importedTheme";

export const terminalThemeNames = [
  "default",
  "one-dark",
  "monokai",
  "dracula",
  "nord",
  "solarized-dark",
  "github-dark",
  "claude-dark",
  "github-light",
  "solarized-light",
  "claude-light",
  "imported",
] as const;

export type TerminalThemeName = (typeof terminalThemeNames)[number];

export type TerminalAppearance = "light" | "dark";

export type AnsiPalette = { readonly [K in keyof typeof ansiColors]: string };

export function isTerminalThemeName(value: string | undefined): value is TerminalThemeName {
  return !!value && terminalThemeNames.includes(value as TerminalThemeName);
}

const labels: Readonly<Record<TerminalThemeName, string>> = {
  default: "Default",
  "one-dark": "One Dark",
  monokai: "Monokai",
  dracula: "Dracula",
  nord: "Nord",
  "solarized-dark": "Solarized Dark",
  "github-dark": "GitHub Dark",
  "claude-dark": "Claude Dark",
  "github-light": "GitHub Light",
  "solarized-light": "Solarized Light",
  "claude-light": "Claude Light",
  imported: "Imported",
};

export function terminalThemeLabel(name: TerminalThemeName): string {
  return name === "imported" && imported ? imported.name : labels[name];
}

// The look brought over from another terminal, as settings hold it; the
// "imported" theme draws it. Set by the settings store whenever they change.
let imported: ImportedTerminalTheme | null = null;
let importedColors: TerminalThemeColors | null = null;

export function setImportedTheme(spec: unknown): void {
  const next = isImportedTheme(spec) ? spec : null;
  if (next === imported || JSON.stringify(next) === JSON.stringify(imported)) return;
  imported = next;
  importedColors = next ? importedThemeColors(next) : null;
}

export function hasImportedTheme(): boolean {
  return imported !== null;
}

export interface TerminalThemeColors {
  appearance: TerminalAppearance;
  bg: string;
  fg: string;
  selection: string;
  cursor: string;
  header: string;
  headerText: string;
  headerHover: string;
  headerActive: string;
  tabActive: string;
  // Unset, the shared palette, which is tuned for a dark background.
  ansi?: AnsiPalette;
}

const themes: Readonly<Record<Exclude<TerminalThemeName, "default" | "imported">, TerminalThemeColors>> = {
  "one-dark": {
    appearance: "dark", ...DARK_HOVER,
    bg: "#282c34", fg: "#abb2bf", selection: "#3e4451", cursor: "#528bff",
    header: "#21252b", headerText: "#636d83", tabActive: "#abb2bf",
  },
  monokai: {
    appearance: "dark", ...DARK_HOVER,
    bg: "#272822", fg: "#f8f8f2", selection: "#49483e", cursor: "#f8f8f0",
    header: "#1e1f1c", headerText: "#75715e", tabActive: "#f8f8f2",
  },
  dracula: {
    appearance: "dark", ...DARK_HOVER,
    bg: "#282a36", fg: "#f8f8f2", selection: "#44475a", cursor: "#f8f8f2",
    header: "#21222c", headerText: "#6272a4", tabActive: "#f8f8f2",
  },
  nord: {
    appearance: "dark", ...DARK_HOVER,
    bg: "#2e3440", fg: "#d8dee9", selection: "#434c5e", cursor: "#d8dee9",
    header: "#272c36", headerText: "#616e88", tabActive: "#d8dee9",
  },
  "solarized-dark": {
    appearance: "dark", ...DARK_HOVER,
    bg: "#002b36", fg: "#839496", selection: "#073642", cursor: "#839496",
    header: "#001f27", headerText: "#586e75", tabActive: "#93a1a1",
  },
  "github-dark": {
    appearance: "dark", ...DARK_HOVER,
    bg: "#0d1117", fg: "#c9d1d9", selection: "#1f2937", cursor: "#c9d1d9",
    header: "#161b22", headerText: "#484f58", tabActive: "#c9d1d9",
  },
  "claude-dark": {
    appearance: "dark", ...DARK_HOVER,
    bg: "#2b2b2b", fg: "#c8c8c8", selection: "#484848", cursor: "#c8c8c8",
    header: "#252525", headerText: "#8a8a8a", tabActive: "#d4d4d4",
  },
  "github-light": {
    appearance: "light", ...LIGHT_HOVER,
    bg: "#ffffff", fg: "#1f2328", selection: "rgba(9,105,218,0.2)", cursor: "#0969da",
    header: "#f6f8fa", headerText: "#57606a", tabActive: "#1f2328",
    ansi: {
      black: "#24292f", red: "#cf222e", green: "#116329", yellow: "#4d2d00",
      blue: "#0969da", magenta: "#8250df", cyan: "#1b7c83", white: "#6e7781",
      brightBlack: "#57606a", brightRed: "#a40e26", brightGreen: "#1a7f37", brightYellow: "#633c01",
      brightBlue: "#218bff", brightMagenta: "#a475f9", brightCyan: "#3192aa", brightWhite: "#8c959f",
    },
  },
  // Solarized's own accents; its white and bright white are its background
  // tones, which would vanish here, so they take its body text tones instead.
  "solarized-light": {
    appearance: "light", ...LIGHT_HOVER,
    bg: "#fdf6e3", fg: "#657b83", selection: "#eee8d5", cursor: "#586e75",
    header: "#eee8d5", headerText: "#586e75", tabActive: "#073642",
    ansi: {
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#657b83",
      brightBlack: "#002b36", brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83",
      brightBlue: "#839496", brightMagenta: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#586e75",
    },
  },
  "claude-light": {
    appearance: "light", ...LIGHT_HOVER,
    bg: "#faf9f5", fg: "#3d3929", selection: "rgba(193,95,60,0.18)", cursor: "#c15f3c",
    header: "#f0eee6", headerText: "#6b6658", tabActive: "#3d3929",
    ansi: {
      black: "#3d3929", red: "#b8312f", green: "#2e7d32", yellow: "#8a6100",
      blue: "#3061a8", magenta: "#9b3d8a", cyan: "#19767a", white: "#6b6658",
      brightBlack: "#7d786a", brightRed: "#c15f3c", brightGreen: "#3d8b3d", brightYellow: "#a07000",
      brightBlue: "#4a7cc2", brightMagenta: "#b0559e", brightCyan: "#2a8a8f", brightWhite: "#8f8a7c",
    },
  },
};

export function getTerminalThemeColors(name: TerminalThemeName): TerminalThemeColors | null {
  if (name === "default") return null;
  if (name === "imported") return importedColors;
  return themes[name] ?? null;
}

// Default has no look of its own: it is the app's, light or dark with it.
export function terminalThemeAppearance(name: TerminalThemeName): TerminalAppearance | null {
  return getTerminalThemeColors(name)?.appearance ?? null;
}

export function terminalAnsiColors(colors: TerminalThemeColors | null): AnsiPalette {
  return colors?.ansi ?? ansiColors;
}

export function terminalXtermTheme(colors: TerminalThemeColors): ITheme {
  return {
    background: colors.bg,
    foreground: colors.fg,
    selectionBackground: colors.selection,
    cursor: colors.cursor,
    ...terminalAnsiColors(colors),
  };
}

export function terminalThemeCssVars(colors: TerminalThemeColors): Record<string, string> {
  const light = colors.appearance === "light";
  return {
    "--terminal-bg": colors.bg,
    "--terminal-fg": colors.fg,
    "--terminal-selection": colors.selection,
    "--terminal-cursor": colors.cursor,
    "--terminal-header": colors.header,
    "--terminal-header-text": colors.headerText,
    "--terminal-header-hover": colors.headerHover,
    "--terminal-header-active": colors.headerActive,
    "--terminal-header-border": `color-mix(in srgb, ${colors.fg} 32%, transparent)`,
    "--terminal-tab-active": colors.tabActive,
    // The active tab pill and its hairline come from the theme itself, not the
    // app: a raised chip of the theme's own colors whichever app theme is on.
    "--terminal-tab-active-bg": light
      ? `color-mix(in srgb, #ffffff 75%, ${colors.bg})`
      : `color-mix(in srgb, ${colors.fg} 15%, ${colors.bg})`,
    "--terminal-tab-shadow": light
      ? "inset 0 0 0 1px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)"
      : "inset 0 0 0 1px rgba(255, 255, 255, 0.08)",
  };
}
