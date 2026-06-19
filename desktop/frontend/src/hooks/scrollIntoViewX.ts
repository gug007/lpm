export interface ScrollIntoViewMetrics {
  scrollLeft: number;
  clientWidth: number;
  // Position of the target relative to the scroll content's left edge.
  elementLeft: number;
  elementWidth: number;
  // Keeps the target clear of the fade gradients at each edge.
  margin: number;
}

// Returns the scrollLeft that brings the target fully into view, or null when
// it is already visible (clear of the margins) so callers can skip scrolling.
export function computeScrollIntoViewLeft({
  scrollLeft,
  clientWidth,
  elementLeft,
  elementWidth,
  margin,
}: ScrollIntoViewMetrics): number | null {
  const elementRight = elementLeft + elementWidth;
  const visibleLeft = scrollLeft + margin;
  const visibleRight = scrollLeft + clientWidth - margin;

  if (elementLeft < visibleLeft) {
    return Math.max(0, elementLeft - margin);
  }
  if (elementRight > visibleRight) {
    return Math.max(0, elementRight - clientWidth + margin);
  }
  return null;
}
