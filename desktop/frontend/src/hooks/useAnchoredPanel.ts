import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

const PANEL_GAP = 8;
const VIEWPORT_MARGIN = 8;
// Below this the preferred side counts as too cramped to use, so a flipping
// panel moves to the other side even when that one is only slightly roomier.
const MIN_PANEL_SPACE = 160;

type Side = "above" | "below";
type Align = "left" | "right";

interface UseAnchoredPanelOptions {
  open: boolean;
  onClose: () => void;
  width: number;
  side?: Side;
  // Which trigger edge the panel lines up with.
  align?: Align;
  // When set, `side` is only a preference: the panel moves to the other side if
  // the preferred one lacks room, and is capped to the space actually available
  // so it scrolls internally instead of running off the window.
  flip?: boolean;
}

interface UseAnchoredPanelResult<T, P> {
  triggerRef: RefObject<T | null>;
  panelRef: RefObject<P | null>;
  style: CSSProperties | null;
}

export function useAnchoredPanel<
  T extends HTMLElement = HTMLElement,
  P extends HTMLElement = HTMLElement,
>({
  open,
  onClose,
  width,
  side = "below",
  align = "right",
  flip = false,
}: UseAnchoredPanelOptions): UseAnchoredPanelResult<T, P> {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<P>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      // A panel may host a portaled modal, rendered outside both refs. Its
      // overlay/backdrop belongs to the layer stack above the panel, not the
      // page behind it, so dismissing the modal must not close its host.
      if ((event.target as Element)?.closest?.("[data-modal-overlay]")) return;
      onCloseRef.current();
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updateStyle = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setStyle(computeStyle(rect, width, side, align, flip));
    };
    updateStyle();
    window.addEventListener("resize", updateStyle);
    // Capture-phase: the trigger may live in a scrolling container (a modal
    // body), and those scrolls don't bubble.
    window.addEventListener("scroll", updateStyle, true);
    return () => {
      window.removeEventListener("resize", updateStyle);
      window.removeEventListener("scroll", updateStyle, true);
    };
  }, [open, width, side, align, flip]);

  return { triggerRef, panelRef, style };
}

export function computeStyle(
  triggerRect: DOMRect,
  width: number,
  side: Side,
  align: Align = "right",
  flip = false,
): CSSProperties {
  const minLeft = VIEWPORT_MARGIN;
  const maxLeft = window.innerWidth - VIEWPORT_MARGIN - width;
  const anchorLeft = align === "left" ? triggerRect.left : triggerRect.right - width;
  const left = clamp(anchorLeft, minLeft, maxLeft);
  const base: CSSProperties = { position: "fixed", left, width };

  const spaceAbove = triggerRect.top - PANEL_GAP - VIEWPORT_MARGIN;
  const spaceBelow = window.innerHeight - triggerRect.bottom - PANEL_GAP - VIEWPORT_MARGIN;
  const resolved = flip ? resolveSide(side, spaceAbove, spaceBelow) : side;
  const maxHeight = flip
    ? { maxHeight: Math.max(0, resolved === "above" ? spaceAbove : spaceBelow) }
    : null;

  if (resolved === "above") {
    return { ...base, ...maxHeight, bottom: window.innerHeight - triggerRect.top + PANEL_GAP };
  }
  return { ...base, ...maxHeight, top: triggerRect.bottom + PANEL_GAP };
}

// Keep the preferred side while it has usable room, or while it's the roomier
// of the two; otherwise flip.
function resolveSide(side: Side, spaceAbove: number, spaceBelow: number): Side {
  const preferred = side === "above" ? spaceAbove : spaceBelow;
  const other = side === "above" ? spaceBelow : spaceAbove;
  if (preferred >= MIN_PANEL_SPACE || preferred >= other) return side;
  return side === "above" ? "below" : "above";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
