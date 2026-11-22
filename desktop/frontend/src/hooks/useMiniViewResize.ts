import { useCallback, type RefObject } from "react";
import {
  MINI_VIEW_DEFAULT_SIZE,
  MINI_VIEW_MIN_SIZE,
  rememberMiniViewSize,
  type MiniViewSize,
} from "../miniViewSize";
import { useMiniViews } from "../store/miniViews";

export type MiniViewEdge = "left" | "top" | "corner";

// Room left between a grown view and the window's edge.
const MARGIN = 12;
// The window height a view's screen leaves to its header, reply row, and the
// composer and footer under the stack; MiniViewCard's max-height says the same.
const SCREEN_INSET = 240;

const CURSOR: Record<MiniViewEdge, string> = { left: "ew-resize", top: "ns-resize", corner: "nwse-resize" };

/** Drag-to-resize for a mini view. The views sit in the window's bottom-right
 *  corner, so they grow from their top and left edges, as far as the window
 *  lets the whole stack go. */
export function useMiniViewResize(termId: string, size: MiniViewSize, cardRef: RefObject<HTMLElement | null>) {
  const start = useCallback(
    (e: React.PointerEvent<HTMLElement>, edge: MiniViewEdge) => {
      const card = cardRef.current;
      if (e.button !== 0 || !card) return;
      e.preventDefault();
      e.stopPropagation();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const stackTop = (card.parentElement ?? card).getBoundingClientRect().top;
      const max = {
        width: size.width + Math.max(0, card.getBoundingClientRect().left - MARGIN),
        height: Math.min(size.height + Math.max(0, stackTop - MARGIN), window.innerHeight - SCREEN_INSET),
      };
      const from = { x: e.clientX, y: e.clientY };
      let next = size;

      const move = (ev: PointerEvent) => {
        const grow = (base: number, delta: number, min: number, most: number) =>
          Math.round(Math.min(most, Math.max(min, base + delta)));
        next = {
          width: edge === "top" ? size.width : grow(size.width, from.x - ev.clientX, MINI_VIEW_MIN_SIZE.width, max.width),
          height:
            edge === "left" ? size.height : grow(size.height, from.y - ev.clientY, MINI_VIEW_MIN_SIZE.height, max.height),
        };
        useMiniViews.getState().resize(termId, next);
      };
      const end = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (next !== size) rememberMiniViewSize(next);
      };
      document.body.style.cursor = CURSOR[edge];
      document.body.style.userSelect = "none";
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    },
    [termId, size, cardRef],
  );

  const reset = useCallback(() => {
    useMiniViews.getState().resize(termId, MINI_VIEW_DEFAULT_SIZE);
    rememberMiniViewSize(MINI_VIEW_DEFAULT_SIZE);
  }, [termId]);

  return { start, reset };
}
