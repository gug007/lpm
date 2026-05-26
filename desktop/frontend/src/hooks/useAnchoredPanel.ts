import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

const PANEL_GAP = 8;
const VIEWPORT_MARGIN = 8;

type Side = "above" | "below";

interface UseAnchoredPanelOptions {
  open: boolean;
  onClose: () => void;
  width: number;
  side?: Side;
}

interface UseAnchoredPanelResult<T, P> {
  triggerRef: RefObject<T | null>;
  panelRef: RefObject<P | null>;
  style: CSSProperties | null;
}

export function useAnchoredPanel<
  T extends HTMLElement = HTMLElement,
  P extends HTMLElement = HTMLElement,
>({ open, onClose, width, side = "below" }: UseAnchoredPanelOptions): UseAnchoredPanelResult<T, P> {
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
      setStyle(computeStyle(rect, width, side));
    };
    updateStyle();
    window.addEventListener("resize", updateStyle);
    return () => window.removeEventListener("resize", updateStyle);
  }, [open, width, side]);

  return { triggerRef, panelRef, style };
}

function computeStyle(triggerRect: DOMRect, width: number, side: Side): CSSProperties {
  const minLeft = VIEWPORT_MARGIN;
  const maxLeft = window.innerWidth - VIEWPORT_MARGIN - width;
  const left = clamp(triggerRect.right - width, minLeft, maxLeft);
  const base: CSSProperties = { position: "fixed", left, width };
  if (side === "above") {
    return { ...base, bottom: window.innerHeight - triggerRect.top + PANEL_GAP };
  }
  return { ...base, top: triggerRect.bottom + PANEL_GAP };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
