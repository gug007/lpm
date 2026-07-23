import type { CSSProperties } from "react";

// Named colors an action's `color:` field can use; each maps to the theme's
// accent CSS vars so it adapts to light/dark. Any other string is treated as a
// raw CSS color (e.g. a hand-authored hex in YAML).
// Ordered as a hue wheel for the picker grid; "claude" is the Claude Code
// brand coral.
export const ACTION_COLOR_HUES = [
  "red",
  "orange",
  "claude",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

// Colored-but-neutral options, kept as a distinct group in the picker.
export const ACTION_COLOR_NEUTRALS = ["slate", "gray", "stone"] as const;

export const ACTION_COLOR_NAMES = [
  ...ACTION_COLOR_HUES,
  ...ACTION_COLOR_NEUTRALS,
] as const;

export type ActionColorName = (typeof ACTION_COLOR_NAMES)[number];

const NAMED = new Set<string>(ACTION_COLOR_NAMES);

export function isNamedActionColor(color: string | undefined): boolean {
  return !!color && NAMED.has(color);
}

export function actionAccentColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return NAMED.has(color) ? `var(--accent-${color})` : color;
}

export function actionTextColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return NAMED.has(color) ? `var(--accent-${color}-text)` : color;
}

// Inline style for an action button: colored label plus tint variables the
// button classes pick up for fills and hover states; the border stays the
// neutral var(--border) like uncolored buttons. Uncolored actions return
// undefined, so every var() consumer falls back to the neutral look.
export function actionButtonStyle(
  color: string | undefined,
): CSSProperties | undefined {
  const accent = actionAccentColor(color);
  if (!accent) return undefined;
  return {
    color: actionTextColor(color),
    "--action-text": actionTextColor(color),
    "--action-tint": `color-mix(in srgb, ${accent} 10%, transparent)`,
    "--action-tint-strong": `color-mix(in srgb, ${accent} 20%, transparent)`,
  } as CSSProperties;
}
