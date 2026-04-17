import { useLayoutEffect, type RefObject } from "react";

// useAutoGrowTextarea resizes the referenced textarea to fit its content,
// capped at maxPx when provided (otherwise it grows unbounded). Runs in a
// layout effect so the new height lands before paint — no flicker.
export function useAutoGrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxPx?: number,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const target = maxPx != null ? Math.min(el.scrollHeight, maxPx) : el.scrollHeight;
    el.style.height = `${target}px`;
  }, [ref, value, maxPx]);
}
