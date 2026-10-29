export type RecapTheme = "dark" | "light" | "green";

export const RECAP_DEFAULT_THEME: RecapTheme = "light";

export function normalizeRecapTheme(value: unknown): RecapTheme | undefined {
  return value === "dark" || value === "green" ? value : undefined;
}

const DARK = {
  glow: "#1c2a21",
  ground: "#1f1f1f",
  border: "#3a3a3a",
  text: "#e5e5e5",
  strong: "#ffffff",
  soft: "#b3b3b3",
  muted: "#a3a3a3",
  tile: "#262626",
  green: "#4ade80",
  red: "#f87171",
  markGround: "#2a2a2a",
  markBorder: "#444444",
  markDot: "#22c55e",
  markRing: "#8a8a8a",
};

export type RecapPalette = typeof DARK;

// Light by default, for a white feed; dark like most screenshots of developer
// tools. Every text color keeps 4.5:1 on its ground.
export const RECAP_THEMES: Record<RecapTheme, RecapPalette> = {
  dark: DARK,
  light: {
    glow: "#e6f2e8",
    ground: "#fafaf7",
    border: "#e2e2dc",
    text: "#1f1f1f",
    strong: "#111111",
    soft: "#4a4a4a",
    muted: "#5f5f5f",
    tile: "#ffffff",
    green: "#15803d",
    red: "#b91c1c",
    markGround: "#f0f0ec",
    markBorder: "#deded8",
    markDot: "#16a34a",
    markRing: "#7a7a7a",
  },
  green: {
    glow: "#14532d",
    ground: "#0f1f16",
    border: "#22573a",
    text: "#e7f5ec",
    strong: "#ffffff",
    soft: "#b7d3c1",
    muted: "#9fbfab",
    tile: "#143322",
    green: "#4ade80",
    red: "#fca5a5",
    markGround: "#143322",
    markBorder: "#2f6146",
    markDot: "#4ade80",
    markRing: "#9fbfab",
  },
};

// In the voice of whoever posts the card: to the people reading the post,
// "your week" would be theirs.
export const RECAP_TITLE = "My agents' week";
export const RECAP_MONTH_TITLE = "My agents' month";
export const RECAP_HOURS_LABEL = "of agents working for me";
export const RECAP_TOKENS_LABEL = "tokens read and written by my agents";

export const RECAP_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", sans-serif';

export const RECAP_LAYOUT = {
  width: 600,
  padX: 28,
  padTop: 26,
  padBottom: 24,
  gap: 16,
  radius: 14,
  titleSize: 17,
  headerLine: 22,
  heroSize: 64,
  // The hours, under the tokens.
  hoursSize: 52,
  heroTracking: -0.02,
  // Between a big number and its label under it.
  stackGap: 6,
  labelLine: 18,
  bodySize: 15,
  tileGap: 10,
  tileRadius: 10,
  tilePadX: 13,
  tilePadY: 11,
  tileValueLine: 28,
  tileLabelLine: 16,
  rowSize: 14,
  rowLine: 18,
  footerLine: 36,
} as const;

/** The angle of the card's green glow, as CSS writes it. */
export const RECAP_GLOW_DEG = 150;
