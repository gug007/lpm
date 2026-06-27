import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useDragBodyAttribute } from "./useDragBodyAttribute";

// Keep at least this much of the modal inside the viewport on every edge, so it
// can never be dragged fully out of reach.
const MARGIN = 12;

// Controls that own their own pointer interactions — a press on one of these
// inside the drag handle (e.g. the close button) must not start a drag.
const NO_DRAG =
  'button, a, input, textarea, select, [role="button"], [contenteditable="true"], [data-no-drag]';

type Offset = { x: number; y: number };

export interface ModalDrag {
  offset: Offset;
  dragging: boolean;
  // Spread on the element whose [data-modal-drag-handle] descendants start a drag.
  onPointerDown: (e: React.PointerEvent) => void;
  // Re-center the content (used when the modal re-opens).
  reset: () => void;
}

type BaseRect = { left: number; top: number; width: number; height: number };

// The content's viewport top-left with its live translate offset removed, so the
// clamp bounds below are computed against the element's un-dragged position.
function baseRect(el: HTMLElement, offset: Offset): BaseRect {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left - offset.x,
    top: rect.top - offset.y,
    width: rect.width,
    height: rect.height,
  };
}

// Clamp a desired translate offset so the content (whose un-offset top-left is
// `base`) stays within the viewport. When the content is larger than the
// viewport there is no room past the start margin, so max collapses to min and
// it pins to the top-left.
function clampToViewport(base: BaseRect, x: number, y: number): Offset {
  const minX = MARGIN - base.left;
  const minY = MARGIN - base.top;
  const maxX = Math.max(
    minX,
    window.innerWidth - MARGIN - base.width - base.left,
  );
  const maxY = Math.max(
    minY,
    window.innerHeight - MARGIN - base.height - base.top,
  );
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

// Drag-to-reposition for a centered overlay. A press inside an element marked
// `[data-modal-drag-handle]` (but not on an interactive control) moves the
// content by a translate offset, clamped so it always stays on screen.
export function useModalDrag(
  contentRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): ModalDrag {
  const [offset, setOffsetState] = useState<Offset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(offset);

  const setOffset = useCallback((next: Offset) => {
    offsetRef.current = next;
    setOffsetState(next);
  }, []);

  const reset = useCallback(() => setOffset({ x: 0, y: 0 }), [setOffset]);

  useDragBodyAttribute(dragging);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (!target.closest("[data-modal-drag-handle]")) return;
      if (target.closest(NO_DRAG)) return;
      const el = contentRef.current;
      if (!el) return;
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const startOffset = offsetRef.current;
      // Measured once at the start so the move handler never forces a layout
      // read per frame.
      const base = baseRect(el, startOffset);

      setDragging(true);

      const onMove = (ev: PointerEvent) => {
        setOffset(
          clampToViewport(
            base,
            startOffset.x + (ev.clientX - startX),
            startOffset.y + (ev.clientY - startY),
          ),
        );
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [enabled, contentRef, setOffset],
  );

  // Keep a previously dragged modal on screen when the viewport OR the content
  // itself changes size — e.g. expanding a section grows the centered box and
  // would otherwise push its lower edge past the bottom until the next drag.
  useEffect(() => {
    if (!enabled) return;
    const el = contentRef.current;
    const reclamp = () => {
      const node = contentRef.current;
      const cur = offsetRef.current;
      if (!node || (cur.x === 0 && cur.y === 0)) return;
      setOffset(clampToViewport(baseRect(node, cur), cur.x, cur.y));
    };
    window.addEventListener("resize", reclamp);
    const observer = el ? new ResizeObserver(reclamp) : null;
    observer?.observe(el!);
    return () => {
      window.removeEventListener("resize", reclamp);
      observer?.disconnect();
    };
  }, [enabled, contentRef, setOffset]);

  return { offset, dragging, onPointerDown, reset };
}
