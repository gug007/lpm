import { useEffect, type RefObject } from "react";
import { translateWheelToX } from "./wheelScrollX";

// Lets a mouse wheel scroll the horizontally-overflowing tab strip (VS Code
// style). A native, non-passive listener is required: React attaches wheel
// handlers at the root as passive, so preventDefault inside an onWheel prop is
// ignored and the page can't be told to convert the gesture.
export function useWheelScrollX(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const d = translateWheelToX(e);
      if (d === null) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += d;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref]);
}
