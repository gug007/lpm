import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

export const SUBMENU_VIEWPORT_MARGIN = 8;
// Cancels the panel's py-1 so its first row aligns with the parent row.
const PANEL_PADDING_OFFSET = -4;

export interface SubmenuPlacement {
  side: "right" | "left";
  shiftY: number;
}

// Where a submenu panel sits beside its row: on the right, flipping to the left
// and shifting up when it would otherwise spill past the viewport edges. The
// panel never climbs above the top margin; if it is taller than the viewport
// its own max-height + scroll keeps every row reachable.
export function useSubmenuPlacement(
  wrapperRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
): SubmenuPlacement {
  const [placement, setPlacement] = useState<SubmenuPlacement>({ side: "right", shiftY: PANEL_PADDING_OFFSET });

  const reposition = useCallback(() => {
    const wrapper = wrapperRef.current;
    const panel = panelRef.current;
    if (!wrapper || !panel) return;
    const w = wrapper.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const overflowsRight = w.right + p.width > window.innerWidth - SUBMENU_VIEWPORT_MARGIN;
    const fitsLeft = w.left - p.width >= SUBMENU_VIEWPORT_MARGIN;
    const side = overflowsRight && fitsLeft ? "left" : "right";
    const desiredTop = w.top + PANEL_PADDING_OFFSET;
    const maxTop = window.innerHeight - SUBMENU_VIEWPORT_MARGIN - p.height;
    const top = Math.max(SUBMENU_VIEWPORT_MARGIN, Math.min(desiredTop, maxTop));
    const shiftY = top - w.top;
    setPlacement((prev) => (prev.side === side && prev.shiftY === shiftY ? prev : { side, shiftY }));
  }, [wrapperRef, panelRef]);

  // Re-measure whenever the open panel changes size — its content can load
  // asynchronously (e.g. the Git submenu), growing the panel after the first
  // measurement and pushing rows off-screen if we positioned it only once.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const panel = panelRef.current;
    if (!panel) return;
    const ro = new ResizeObserver(() => reposition());
    ro.observe(panel);
    return () => ro.disconnect();
  }, [open, reposition, panelRef]);

  return placement;
}
