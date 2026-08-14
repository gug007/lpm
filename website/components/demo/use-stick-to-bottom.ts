import { useCallback, useEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 48;

/** Follows new terminal output, but yields the moment the reader scrolls up —
 *  service logs stream forever, so a hard scroll-to-bottom would fight anyone
 *  reading their scrollback. */
export function useStickToBottom<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);
  const stick = useRef(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    stick.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // A pane belonging to an unselected project is display:none, so output that
  // arrived while it was hidden lands above the fold. Catch up when it returns.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (el.clientHeight > 0 && stick.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, onScroll };
}
