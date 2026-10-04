import { type DependencyList, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Hysteresis: once wrapped, cache the row width required to fit inline
// and only unwrap when the row grows past that threshold, preventing
// oscillation at the boundary.
//
// While paused (a drag is moving buttons between rows), changes are only
// noted and measured once the pause ends: flipping `wrapped` mid-drag would
// move the actions to another parent and remount every sortable in them.
export function useOverflowWrap(deps: DependencyList, paused = false) {
  const rowRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const inlineMinWidthRef = useRef(0);
  const pendingMeasureRef = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const staleRef = useRef(false);
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

  // The row keeps its width when its contents grow (late fonts, a split
  // button's remembered label, a zone's widest layer), so the inner items are
  // watched too, and re-attached as they come and go.
  useEffect(() => {
    const row = rowRef.current;
    const inner = innerRef.current;
    if (!row) return;
    const observer = new ResizeObserver(() => {
      if (pausedRef.current) staleRef.current = true;
      else measure();
    });
    const observeItems = () => {
      observer.disconnect();
      observer.observe(row);
      if (inner) for (const item of inner.children) observer.observe(item);
    };
    observeItems();
    const items = new MutationObserver(observeItems);
    if (inner) items.observe(inner, { childList: true });
    return () => {
      items.disconnect();
      observer.disconnect();
    };
  }, [measure]);

  // Content changed: drop the cached threshold and re-measure. If we're
  // currently wrapped, flip to inline first so the trailing effect below
  // measures a fresh inline layout.
  const remeasure = () => {
    staleRef.current = false;
    inlineMinWidthRef.current = 0;
    if (wrapped) {
      pendingMeasureRef.current = true;
      setWrapped(false);
      return;
    }
    measure();
  };

  useLayoutEffect(() => {
    if (paused) staleRef.current = true;
    else remeasure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useLayoutEffect(() => {
    if (!paused && staleRef.current) remeasure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // Trailing measurement for the "was wrapped, forced to inline" path above.
  useLayoutEffect(() => {
    if (pendingMeasureRef.current && !wrapped) {
      pendingMeasureRef.current = false;
      measure();
    }
  }, [wrapped, measure]);

  return { wrapped, rowRef, innerRef };
}
