import { useCallback, useRef } from "react";

const STEP_PX = 30;
// A swipe, momentum tail included, ends once its wheel events stop this long.
const QUIET_MS = 150;

// A React onWheel event or a native one: React listens to wheel passively, so
// a caller that must stop the page scrolling attaches the handler natively.
type SwipeWheel = Pick<WheelEvent, "deltaX" | "deltaY" | "preventDefault">;

// A sideways trackpad swipe steps once, however long its momentum runs. One
// that can't step that way is left to scroll the row.
export function useLayerSwipe(
  onStep: (dir: 1 | -1) => void,
  canStep: (dir: 1 | -1) => boolean,
): (e: SwipeWheel) => void {
  const latest = useRef({ onStep, canStep });
  latest.current = { onStep, canStep };
  const travel = useRef(0);
  const stepped = useRef(false);
  const lastAt = useRef(Number.NEGATIVE_INFINITY);
  return useCallback((e: SwipeWheel) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const now = Date.now();
    if (now - lastAt.current >= QUIET_MS) {
      travel.current = 0;
      stepped.current = false;
    }
    lastAt.current = now;
    // The rest of a swipe that already stepped, onto the last layer too.
    if (stepped.current) {
      e.preventDefault();
      return;
    }
    const dir = e.deltaX > 0 ? 1 : -1;
    if (!latest.current.canStep(dir)) {
      travel.current = 0;
      return;
    }
    e.preventDefault();
    travel.current += e.deltaX;
    if (Math.abs(travel.current) < STEP_PX) return;
    travel.current = 0;
    stepped.current = true;
    latest.current.onStep(dir);
  }, []);
}
