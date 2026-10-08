import type { CSSProperties } from "react";

export const PRIMARY_BUTTON =
  "shrink-0 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-60";
export const SECONDARY_BUTTON =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-60";
export const QUIET_BUTTON =
  "shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-60";
export const LINK_BUTTON =
  "text-[var(--accent-blue-text)] underline-offset-2 transition-colors hover:underline";

export type TileTone = "idle" | "live" | "warn" | "problem";

const tint = (accent: string): CSSProperties => ({
  backgroundColor: `color-mix(in srgb, ${accent} 15%, transparent)`,
  color: accent,
});

export const TILE_STYLE: Record<TileTone, CSSProperties> = {
  idle: { backgroundColor: "var(--bg-active)", color: "var(--text-muted)" },
  live: tint("var(--accent-green)"),
  warn: tint("var(--accent-amber)"),
  problem: tint("var(--accent-red)"),
};

export const SUBTITLE_COLOR: Record<TileTone, string> = {
  idle: "var(--text-muted)",
  live: "var(--text-muted)",
  warn: "var(--accent-amber-text)",
  problem: "var(--accent-red-text)",
};
