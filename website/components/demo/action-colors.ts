import type { CSSProperties } from "react";

// Ports the app's `actionButtonStyle`: a colored label plus the tint vars the
// button classes read for their fill and hover. The border stays neutral, so a
// colored action reads as a tinted panel rather than an outlined chip.
export function actionButtonStyle(color?: string): CSSProperties | undefined {
  if (!color) return undefined;
  return {
    color,
    "--action-tint": `color-mix(in srgb, ${color} 10%, transparent)`,
    "--action-tint-strong": `color-mix(in srgb, ${color} 20%, transparent)`,
  } as CSSProperties;
}
