import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

// The page's scroller, fading out at the bottom while more of it lies below, so
// a panel cut by the window edge reads as "scroll on" rather than as clipped.
export function StatsScroll({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  const update = useCallback(() => {
    const el = scroller.current;
    if (el) setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [update]);

  return (
    <div className="relative mt-4 flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={update} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div ref={content}>{children}</div>
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--bg-primary)] to-transparent transition-opacity duration-200 ${
          more ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
