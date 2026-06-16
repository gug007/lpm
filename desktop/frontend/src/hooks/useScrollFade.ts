import { type DependencyList, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { computeScrollFade, type ScrollFade } from "./scrollFade";

export function useScrollFade<T extends HTMLElement>(deps: DependencyList) {
  const ref = useRef<T>(null);
  const [fade, setFade] = useState<ScrollFade>({ canScrollLeft: false, canScrollRight: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = computeScrollFade({
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    });
    setFade((prev) =>
      prev.canScrollLeft === next.canScrollLeft && prev.canScrollRight === next.canScrollRight
        ? prev
        : next,
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, canScrollLeft: fade.canScrollLeft, canScrollRight: fade.canScrollRight };
}
