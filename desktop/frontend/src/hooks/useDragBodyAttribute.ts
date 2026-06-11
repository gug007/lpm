import { useEffect } from "react";

// Drives the globals.css body[data-lpm-drag] rules: grabbing cursor
// plus hover/tooltip muting under a pointer-events-none DragOverlay.
export function useDragBodyAttribute(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    document.body.setAttribute("data-lpm-drag", "");
    return () => document.body.removeAttribute("data-lpm-drag");
  }, [active]);
}
