import { useEffect, type RefObject } from "react";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Calls `onMove` once a frame at most when `ref`'s box moves or resizes: a
// native webview laid over it isn't in the page's layout, so it follows here.
// Watches the box and the card around it, and the window resizing or
// scrolling, the way BrowserPane keeps its webview on its hole.
export function useFollowRect(ref: RefObject<HTMLElement | null>, onMove: (rect: Rect) => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = "";
    let frame = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const key = `${r.left},${r.top},${r.width},${r.height}`;
      if (key === last) return;
      last = key;
      onMove({ x: r.left, y: r.top, width: r.width, height: r.height });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    const card = el.closest("[data-popup-card]");
    if (card) observer.observe(card);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [ref, onMove]);
}
