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

// Tonal variants are derived from the base accent with color-mix rather than
// getting their own theme tokens, so "blue-deep" darkens var(--accent-blue) and
// still follows the light/dark switch.
export const ACTION_COLOR_SHADES = ["deep"] as const;

export type ActionColorShade = (typeof ACTION_COLOR_SHADES)[number];

// How much of the base accent survives the mix toward black. Tuned so deep
// tones stay legible against the dark theme's panel background.
const SHADE_STRENGTH: Record<ActionColorShade, number> = { deep: 74 };

const SHADES = new Set<string>(ACTION_COLOR_SHADES);

function splitShade(
  color: string,
): { base: string; shade: ActionColorShade } | null {
  const cut = color.lastIndexOf("-");
  if (cut < 0) return null;
  const base = color.slice(0, cut);
  const shade = color.slice(cut + 1);
  if (!NAMED.has(base) || !SHADES.has(shade)) return null;
  return { base, shade: shade as ActionColorShade };
}

export function actionColorVariants(
  names: readonly string[],
  shade: ActionColorShade,
): string[] {
  return names.map((name) => `${name}-${shade}`);
}

// "blue-deep" reads as "deep blue" in tooltips and aria labels.
export function actionColorLabel(color: string): string {
  const parsed = splitShade(color);
  return parsed ? `${parsed.shade} ${parsed.base}` : color;
}

export function isNamedActionColor(color: string | undefined): boolean {
  return !!color && (NAMED.has(color) || splitShade(color) !== null);
}

export function actionAccentColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (NAMED.has(color)) return `var(--accent-${color})`;
  const parsed = splitShade(color);
  if (!parsed) return color;
  const strength = SHADE_STRENGTH[parsed.shade];
  return `color-mix(in srgb, var(--accent-${parsed.base}) ${strength}%, black)`;
}

export function actionTextColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (NAMED.has(color)) return `var(--accent-${color}-text)`;
  const parsed = splitShade(color);
  if (!parsed) return color;
  return `var(--accent-${parsed.base}-text)`;
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
