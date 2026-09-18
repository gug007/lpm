import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// Which rows of a fixed-height list to mount for its scroll position, plus
// the padding that stands in for the rest. Until the list has a measured
// height (jsdom, first paint) every row mounts.
export function useVirtualList(
  listRef: RefObject<HTMLElement | null>,
  count: number,
  rowHeight: number,
  overscanPx = 300,
) {
  const [window, setWindow] = useState({ first: 0, last: -1 });
  const windowRef = useRef(window);
  const stateRef = useRef({ scrollTop: 0, height: 0 });
  const rafRef = useRef<number | null>(null);

  const update = useCallback(() => {
    rafRef.current = null;
    const { scrollTop, height } = stateRef.current;
    const span = height || Number.MAX_SAFE_INTEGER;
    const first = Math.max(0, Math.floor((scrollTop - overscanPx) / rowHeight));
    const last = Math.min(count - 1, Math.ceil((scrollTop + span + overscanPx) / rowHeight));
    const prev = windowRef.current;
    if (prev.first === first && prev.last === last) return;
    windowRef.current = { first, last };
    setWindow(windowRef.current);
  }, [count, rowHeight, overscanPx]);

  const schedule = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(update);
  }, [update]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    stateRef.current = { scrollTop: el.scrollTop, height: el.clientHeight };
    update();
    const onScroll = () => {
      stateRef.current.scrollTop = el.scrollTop;
      schedule();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            stateRef.current.height = entries[0]?.contentRect.height ?? 0;
            schedule();
          });
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [listRef, update, schedule]);

  // Scrolls the least distance that brings a row fully into view.
  const ensureVisible = useCallback(
    (index: number) => {
      const el = listRef.current;
      const { scrollTop, height } = stateRef.current;
      if (!el || index < 0 || !height) return;
      const top = index * rowHeight;
      const bottom = top + rowHeight;
      if (top < scrollTop) el.scrollTop = top;
      else if (bottom > scrollTop + height) el.scrollTop = bottom - height;
    },
    [listRef, rowHeight],
  );

  return {
    first: window.first,
    last: window.last,
    paddingTop: window.first * rowHeight,
    paddingBottom: Math.max(0, count - 1 - window.last) * rowHeight,
    ensureVisible,
  };
}
