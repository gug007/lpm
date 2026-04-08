import { useRef, useState } from "react";
import { getSettings, saveSettings } from "../settings";

const MIN_WIDTH = 160;
const MAX_WIDTH = 400;

/**
 * Manages the sidebar's resizable width. Returns the current width and a
 * mousedown handler to attach to a drag handle. Persists the width to
 * settings on release.
 */
export function useSidebarResize() {
  const [width, setWidth] = useState(() => getSettings().sidebarWidth || 260);
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    const onMove = (ev: MouseEvent) => {
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const w = widthRef.current;
      saveSettings({ sidebarWidth: w });
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return { width, handleResizeStart };
}
