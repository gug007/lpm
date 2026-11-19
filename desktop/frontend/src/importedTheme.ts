import { DARK_HOVER, LIGHT_HOVER, ansiColors } from "./components/terminal-colors";
import type { AnsiPalette, TerminalThemeColors } from "./terminal-themes";

// Colors brought over from another terminal (Settings › Terminal), kept in
// settings as `terminalImportedTheme` and drawn as the "imported" theme.
export interface ImportedTerminalTheme {
  // Where it came from: "Ghostty · Catppuccin Mocha".
  name: string;
  bg: string;
  fg: string;
  cursor?: string;
  selection?: string;
  // Black to bright white; "" where the other terminal set none.
  ansi?: string[];
}

const ANSI_KEYS = Object.keys(ansiColors) as (keyof typeof ansiColors)[];

function rgb(color: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

// `a` with `amount` of `b` mixed in.
function mix(a: string, b: string, amount: number): string {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return a;
  return hex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * amount) as [number, number, number]);
}

function isLight(color: string): boolean {
  const c = rgb(color);
  if (!c) return false;
  const [r, g, b] = c.map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

// A full theme from what the other terminal set: the header shades and the
// colors it left out follow its own background and text.
export function importedThemeColors(spec: ImportedTerminalTheme): TerminalThemeColors {
  const light = isLight(spec.bg);
  const ansi = Object.fromEntries(
    ANSI_KEYS.map((key, i) => [key, rgb(spec.ansi?.[i] ?? "") ? spec.ansi![i] : ansiColors[key]]),
  ) as AnsiPalette;
  return {
    appearance: light ? "light" : "dark",
    ...(light ? LIGHT_HOVER : DARK_HOVER),
    bg: spec.bg,
    fg: spec.fg,
    selection: spec.selection || mix(spec.bg, spec.fg, 0.25),
    cursor: spec.cursor || spec.fg,
    header: mix(spec.bg, "#000000", light ? 0.05 : 0.18),
    headerText: mix(spec.fg, spec.bg, 0.4),
    tabActive: spec.fg,
    ansi,
  };
}

export function isImportedTheme(value: unknown): value is ImportedTerminalTheme {
  const v = value as ImportedTerminalTheme | null;
  return !!v && typeof v.name === "string" && !!rgb(v.bg ?? "") && !!rgb(v.fg ?? "");
}
