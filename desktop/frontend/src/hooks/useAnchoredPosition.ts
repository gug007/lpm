import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

const GAP = 8;
const EDGE_MARGIN = 8;

type AnchoredPos = { top: number; left: number; placement: "top" | "bottom" };

export interface Anchored {
  style: CSSProperties;
  placement: AnchoredPos["placement"] | null;
}

// Where a fixed popover sits: above `anchor` (below when there's no room),
// lined up with its left edge or centred on it, and kept inside the window.
// `style` keeps it hidden until it's measured; `placement` is null until then.
export function useAnchoredPosition(
  ref: RefObject<HTMLElement | null>,
  anchor: DOMRect,
  align: "start" | "center" = "start",
): Anchored {
  const [pos, setPos] = useState<AnchoredPos | null>(null);

  // offsetWidth/Height rather than getBoundingClientRect: those ignore CSS
  // transforms, so an entrance animation's scale can't corrupt the math.
  const reposition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let placement: AnchoredPos["placement"] = "top";
    let top = anchor.top - h - GAP;
    if (top < EDGE_MARGIN) {
      top = anchor.bottom + GAP;
      placement = "bottom";
    }
    const wanted = align === "center" ? anchor.left + anchor.width / 2 - w / 2 : anchor.left;
    const left = Math.max(EDGE_MARGIN, Math.min(wanted, window.innerWidth - EDGE_MARGIN - w));
    top = Math.max(EDGE_MARGIN, Math.min(top, window.innerHeight - EDGE_MARGIN - h));
    setPos((prev) =>
      prev && prev.top === top && prev.left === left && prev.placement === placement ? prev : { top, left, placement },
    );
  }, [ref, anchor, align]);

  // After every render, since what the popover shows sets its size. A size that
  // settles later (an image decoding) reaches it through the observer; without
  // that the first hover is seated against the empty box.
  useLayoutEffect(reposition);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(reposition);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, reposition]);

  return {
    style: { top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" },
    placement: pos?.placement ?? null,
  };
}
