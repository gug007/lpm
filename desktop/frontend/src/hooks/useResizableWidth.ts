import { useRef, useState } from "react";

interface ResizableWidthOptions {
  initial: number | (() => number);
  min: number;
  max: number;
  // "right" (default): a handle on the element's right edge — dragging right
  // grows it. "left": a handle on the left edge — dragging left grows it.
  side?: "left" | "right";
  // Called once on mouse-up with the final width, for persistence.
  onCommit?: (width: number) => void;
}

// Drag-to-resize a panel's width. Shared by the sidebar and the review file tree.
export function useResizableWidth({
  initial,
  min,
  max,
  side = "right",
  onCommit,
}: ResizableWidthOptions) {
  const [width, setWidth] = useState(initial);
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    const dir = side === "left" ? -1 : 1;
    const onMove = (ev: MouseEvent) => {
      setWidth(
        Math.min(max, Math.max(min, startWidth + dir * (ev.clientX - startX))),
      );
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onCommit?.(widthRef.current);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return { width, handleResizeStart };
}
