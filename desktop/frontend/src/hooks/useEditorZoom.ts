import { useCallback } from "react";
import { DEFAULT_MONACO_FONT_SIZE, clampMonacoFontSize } from "../monaco-theme";
import { saveSettings, useSettingsStore } from "../store/settings";
import type { ContentZoom } from "./useContentZoom";
import { useEventListener } from "./useEventListener";

const noSurface = () => {};

// Zoom for Monaco surfaces: steps the shared editor font size every editor
// follows. ⌘+ / ⌘− / ⌘0 are taken in the capture phase while enabled, ahead of
// the focused editor's own bindings, so one press is one step.
export function useEditorZoom(enabled: boolean): ContentZoom {
  const size = useSettingsStore((s) => s.editorFontSize) || DEFAULT_MONACO_FONT_SIZE;
  const setSize = useCallback((next: number) => {
    void saveSettings({ editorFontSize: clampMonacoFontSize(next) });
  }, []);
  const zoomIn = useCallback(() => setSize(size + 1), [setSize, size]);
  const zoomOut = useCallback(() => setSize(size - 1), [setSize, size]);
  const zoomReset = useCallback(() => setSize(DEFAULT_MONACO_FONT_SIZE), [setSize]);

  useEventListener(
    "keydown",
    (e) => {
      if (!e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "=" || e.key === "+") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "0") zoomReset();
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
    window,
    enabled,
    true,
  );

  const zoom = size / DEFAULT_MONACO_FONT_SIZE;
  return {
    zoom,
    percent: Math.round(zoom * 100),
    zoomIn,
    zoomOut,
    zoomReset,
    canZoomIn: clampMonacoFontSize(size + 1) !== size,
    canZoomOut: clampMonacoFontSize(size - 1) !== size,
    surfaceRef: noSurface,
  };
}
