import { useRef, useState } from "react";

interface ResizableWidthOptions {
  // The width to start from when nothing is stored.
  initial: number | (() => number);
  min: number;
  max: number;
  // The edge the handle sits on. A panel on the right side of the layout is
  // dragged from its left edge, so the same motion narrows instead of widens.
  edge?: "left" | "right";
  // Remembers the committed width under this localStorage key.
  storageKey?: string;
  // Called once on mouse-up with the final width.
  onCommit?: (width: number) => void;
}

// Drag-to-resize a panel's width. Shared by the sidebar and the file trees.
export function useResizableWidth({
  initial,
  min,
  max,
  edge = "right",
  storageKey,
  onCommit,
}: ResizableWidthOptions) {
  const [width, setWidth] = useState(() => {
    const stored = storageKey ? Number(localStorage.getItem(storageKey)) : NaN;
    if (stored >= min && stored <= max) return stored;
    return typeof initial === "function" ? initial() : initial;
  });
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    const sign = edge === "left" ? -1 : 1;
    const onMove = (ev: MouseEvent) => {
      setWidth(
        Math.min(max, Math.max(min, startWidth + sign * (ev.clientX - startX))),
      );
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (storageKey) localStorage.setItem(storageKey, String(widthRef.current));
      onCommit?.(widthRef.current);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return { width, handleResizeStart };
}
