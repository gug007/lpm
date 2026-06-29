import { useRef, useState } from "react";

interface ResizableWidthOptions {
  initial: number | (() => number);
  min: number;
  max: number;
  // Called once on mouse-up with the final width, for persistence.
  onCommit?: (width: number) => void;
}

// Drag-to-resize a panel's width. Shared by the sidebar and the review file tree.
export function useResizableWidth({
  initial,
  min,
  max,
  onCommit,
}: ResizableWidthOptions) {
  const [width, setWidth] = useState(initial);
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    const onMove = (ev: MouseEvent) => {
      setWidth(
        Math.min(max, Math.max(min, startWidth + (ev.clientX - startX))),
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
