// Translates a wheel gesture into a horizontal scroll delta for the tab strip,
// or null when the strip should not intercept it.
export function translateWheelToX(e: {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}): number | null {
  // A trackpad pinch reaches WebKit as ctrl+wheel with a dominant vertical
  // delta — not a scroll intent, so never convert it.
  if (e.ctrlKey) return null;
  // Horizontal-dominant gestures are a trackpad pan the browser already scrolls
  // natively; only hijack the wheel when the vertical axis clearly dominates.
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return null;
  // Line/page modes report rows, not pixels — scale to a sane pixel step.
  return e.deltaMode !== 0 ? e.deltaY * 16 : e.deltaY;
}
