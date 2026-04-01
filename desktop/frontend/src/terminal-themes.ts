export type TerminalThemeName =
  | "default"
  | "one-dark"
  | "monokai"
  | "dracula"
  | "nord"
  | "solarized-dark"
  | "github-dark";

export interface TerminalThemeColors {
  bg: string;
  fg: string;
  selection: string;
  cursor: string;
  header: string;
  headerText: string;
  headerHover: string;
  headerActive: string;
  tabActive: string;
}

export const terminalThemeNames: TerminalThemeName[] = [
  "default",
  "one-dark",
  "monokai",
  "dracula",
  "nord",
  "solarized-dark",
  "github-dark",
];

const themes: Record<Exclude<TerminalThemeName, "default">, TerminalThemeColors> = {
  "one-dark": {
    bg: "#282c34", fg: "#abb2bf", selection: "#3e4451", cursor: "#528bff",
    header: "#21252b", headerText: "#636d83", headerHover: "rgba(255,255,255,0.04)",
    headerActive: "rgba(255,255,255,0.08)", tabActive: "#abb2bf",
  },
  monokai: {
    bg: "#272822", fg: "#f8f8f2", selection: "#49483e", cursor: "#f8f8f0",
    header: "#1e1f1c", headerText: "#75715e", headerHover: "rgba(255,255,255,0.04)",
    headerActive: "rgba(255,255,255,0.08)", tabActive: "#f8f8f2",
  },
  dracula: {
    bg: "#282a36", fg: "#f8f8f2", selection: "#44475a", cursor: "#f8f8f2",
    header: "#21222c", headerText: "#6272a4", headerHover: "rgba(255,255,255,0.04)",
    headerActive: "rgba(255,255,255,0.08)", tabActive: "#f8f8f2",
  },
  nord: {
    bg: "#2e3440", fg: "#d8dee9", selection: "#434c5e", cursor: "#d8dee9",
    header: "#272c36", headerText: "#616e88", headerHover: "rgba(255,255,255,0.04)",
    headerActive: "rgba(255,255,255,0.08)", tabActive: "#d8dee9",
  },
  "solarized-dark": {
    bg: "#002b36", fg: "#839496", selection: "#073642", cursor: "#839496",
    header: "#001f27", headerText: "#586e75", headerHover: "rgba(255,255,255,0.04)",
    headerActive: "rgba(255,255,255,0.08)", tabActive: "#93a1a1",
  },
  "github-dark": {
    bg: "#0d1117", fg: "#c9d1d9", selection: "#1f2937", cursor: "#c9d1d9",
    header: "#161b22", headerText: "#484f58", headerHover: "rgba(255,255,255,0.04)",
    headerActive: "rgba(255,255,255,0.08)", tabActive: "#c9d1d9",
  },
};

export function getTerminalThemeColors(name: TerminalThemeName): TerminalThemeColors | null {
  if (name === "default") return null;
  return themes[name] ?? null;
}

export function terminalThemeCssVars(colors: TerminalThemeColors): Record<string, string> {
  return {
    "--terminal-bg": colors.bg,
    "--terminal-fg": colors.fg,
    "--terminal-selection": colors.selection,
    "--terminal-cursor": colors.cursor,
    "--terminal-header": colors.header,
    "--terminal-header-text": colors.headerText,
    "--terminal-header-hover": colors.headerHover,
    "--terminal-header-active": colors.headerActive,
    "--terminal-tab-active": colors.tabActive,
  };
}
