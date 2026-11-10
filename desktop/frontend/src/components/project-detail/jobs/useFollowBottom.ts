import { useRef } from "react";

// How close to the end still counts as reading the newest lines.
const NEAR_BOTTOM_PX = 80;

// A page that grows while it's read: `follow` keeps it on its newest lines only
// while the reader is already there, so scrolling back up isn't undone.
export function useFollowBottom(surfaceRef: (el: HTMLElement | null) => void) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottom = useRef(true);
  return {
    scrollRef,
    nearBottom,
    ref: (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      surfaceRef(el);
    },
    onScroll: () => {
      const el = scrollRef.current;
      if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    },
    follow: () => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
      });
    },
  };
}
