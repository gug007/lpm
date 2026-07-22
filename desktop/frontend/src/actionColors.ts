import type { CSSProperties } from "react";

// Named colors an action's `color:` field can use; each maps to the theme's
// accent CSS vars so it adapts to light/dark. Any other string is treated as a
// raw CSS color (e.g. a hand-authored hex in YAML).
// Ordered as a hue wheel for the picker grid; "claude" is the Claude Code
// brand coral, "slate" a colored-but-neutral option.
export const ACTION_COLOR_NAMES = [
  "red",
  "orange",
  "claude",
  "amber",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "purple",
  "pink",
  "slate",
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

// Inline style for an action button: colored label plus a softened border so
// the tint reads without overpowering the bar.
export function actionButtonStyle(
  color: string | undefined,
): CSSProperties | undefined {
  const accent = actionAccentColor(color);
  if (!accent) return undefined;
  return {
    color: actionTextColor(color),
    borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
  };
}
