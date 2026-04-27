import { useCallback, useEffect, useState } from "react";
import { getSettings, saveSettings } from "../settings";

const DEFAULT_FONT_SIZE = 12;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 24;

export interface UseTerminalFontSizeResult {
  fontSize: number;
  zoomIn: () => void;
  zoomOut: () => void;
}

// Tracks the terminal font size with bounded zoom. Persisted lazily —
// only saves when the value changes, not on every render.
export function useTerminalFontSize(): UseTerminalFontSizeResult {
  const [fontSize, setFontSize] = useState(() => getSettings().terminalFontSize || DEFAULT_FONT_SIZE);

  useEffect(() => {
    if (getSettings().terminalFontSize !== fontSize) saveSettings({ terminalFontSize: fontSize });
  }, [fontSize]);

  const zoomIn = useCallback(() => setFontSize((s) => Math.min(s + 1, MAX_FONT_SIZE)), []);
  const zoomOut = useCallback(() => setFontSize((s) => Math.max(s - 1, MIN_FONT_SIZE)), []);

  return { fontSize, zoomIn, zoomOut };
}
