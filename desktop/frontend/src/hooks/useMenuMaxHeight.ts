import { useLayoutEffect, useRef, useState, type RefObject } from "react";

const VIEWPORT_MARGIN = 12;
const MIN_HEIGHT = 120;

export function useMenuMaxHeight<T extends HTMLElement = HTMLElement>(
  placement: "up" | "down",
): { ref: RefObject<T | null>; maxHeight?: number } {
  const ref = useRef<T>(null);
  const [maxHeight, setMaxHeight] = useState<number>();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const available =
        placement === "up"
          ? rect.bottom - VIEWPORT_MARGIN
          : window.innerHeight - rect.top - VIEWPORT_MARGIN;
      setMaxHeight(Math.max(MIN_HEIGHT, Math.floor(available)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [placement]);

  return { ref, maxHeight };
}
