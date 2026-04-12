import { type DependencyList, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Detects when a flex row's content can't fit on a single line and toggles a
 * `wrapped` flag so the caller can re-render the overflowing section onto its
 * own row.
 *
 * Attach `rowRef` to the row whose width bounds the available space and
 * `innerRef` to the flex container whose children determine the needed width.
 * Pass layout-affecting values as `deps`; whenever any of them changes the
 * cached fit threshold is invalidated and the layout is re-measured.
 *
 * Hysteresis: once wrapped, we cache the row width required to fit inline and
 * only unwrap when the row grows past that threshold, preventing oscillation
 * at the boundary.
 */
export function useOverflowWrap(deps: DependencyList) {
  const rowRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const inlineMinWidthRef = useRef(0);
  const pendingMeasureRef = useRef(false);
  const [wrapped, setWrapped] = useState(false);

  const measure = useCallback(() => {
    const row = rowRef.current;
    const inner = innerRef.current;
    if (!row || !inner) return;
    setWrapped((prev) => {
      if (prev) {
        const fitsInline =
          inlineMinWidthRef.current > 0 && row.clientWidth >= inlineMinWidthRef.current;
        return !fitsInline;
      }
      // scrollWidth only reports end-side overflow; with justify-end the
      // overflow lands on the start side, so measure child rects directly.
      const innerRect = inner.getBoundingClientRect();
      let minLeft = innerRect.left;
      let maxRight = innerRect.right;
      for (let i = 0; i < inner.children.length; i++) {
        const r = inner.children[i].getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.left < minLeft) minLeft = r.left;
        if (r.right > maxRight) maxRight = r.right;
      }
      const overflow = Math.max(0, maxRight - minLeft - innerRect.width);
      if (overflow === 0) return false;
      inlineMinWidthRef.current = row.clientWidth + overflow;
      return true;
    });
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure]);

  // Content changed: drop the cached threshold and re-measure. If we're
  // currently wrapped, flip to inline first so the trailing effect below
  // measures a fresh inline layout.
  useLayoutEffect(() => {
    inlineMinWidthRef.current = 0;
    if (wrapped) {
      pendingMeasureRef.current = true;
      setWrapped(false);
      return;
    }
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Trailing measurement for the "was wrapped, forced to inline" path above.
  useLayoutEffect(() => {
    if (pendingMeasureRef.current && !wrapped) {
      pendingMeasureRef.current = false;
      measure();
    }
  }, [wrapped, measure]);

  return { wrapped, rowRef, innerRef };
}
