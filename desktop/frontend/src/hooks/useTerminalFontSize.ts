import { useCallback, useEffect, useState } from "react";
import { getSettings, saveSettings } from "../settings";
import {
  TERMINAL_SETTINGS_CHANGED_EVENT,
  notifyTerminalSettingsChanged,
} from "./terminalSettingsEvents";

export const DEFAULT_TERMINAL_FONT_SIZE = 12;
export const MIN_TERMINAL_FONT_SIZE = 8;
export const MAX_TERMINAL_FONT_SIZE = 24;

export interface UseTerminalFontSizeResult {
  fontSize: number;
  zoomIn: () => void;
  zoomOut: () => void;
}

// Tracks the terminal font size with bounded zoom. Persisted lazily —
// only saves when the value changes, not on every render. Awaits the
// save before broadcasting so peer hooks read the fresh cached value.
export function useTerminalFontSize(): UseTerminalFontSizeResult {
  const [fontSize, setFontSize] = useState(() => getSettings().terminalFontSize || DEFAULT_TERMINAL_FONT_SIZE);

  useEffect(() => {
    if (getSettings().terminalFontSize === fontSize) return;
    saveSettings({ terminalFontSize: fontSize }).then(notifyTerminalSettingsChanged);
  }, [fontSize]);

  useEffect(() => {
    const sync = () => {
      const next = getSettings().terminalFontSize || DEFAULT_TERMINAL_FONT_SIZE;
      setFontSize((cur) => (cur === next ? cur : next));
    };
    window.addEventListener(TERMINAL_SETTINGS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TERMINAL_SETTINGS_CHANGED_EVENT, sync);
  }, []);

  const zoomIn = useCallback(() => setFontSize((s) => Math.min(s + 1, MAX_TERMINAL_FONT_SIZE)), []);
  const zoomOut = useCallback(() => setFontSize((s) => Math.max(s - 1, MIN_TERMINAL_FONT_SIZE)), []);

  return { fontSize, zoomIn, zoomOut };
}
