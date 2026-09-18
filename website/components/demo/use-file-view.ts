import { useCallback, useMemo, useState } from "react";

export type FileView = "diff" | "preview" | "source";

export interface FileViewOption {
  value: FileView;
  label: string;
}

export interface ReaderZoom {
  zoom: number;
  percent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

const MARKDOWN_RE = /\.(md|markdown)$/i;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

const DIFF: FileViewOption = { value: "diff", label: "Diff" };
const PREVIEW: FileViewOption = { value: "preview", label: "Preview" };
const SOURCE: FileViewOption = { value: "source", label: "Source" };
const FILE: FileViewOption = { value: "source", label: "File" };

// The app remembers both across launches; the demo remembers them for the
// page, so switching projects (which remounts the tab) keeps the visitor's pick.
let rememberedPreview = true;
let rememberedZoom = 1;

const clamp = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +value.toFixed(2)));

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_RE.test(path);
}

// The ways the editor can show the open file: a changed file against HEAD, a
// Markdown file rendered, and any file as its source. Mirrors the app's
// useFileView.
export function useFileView(
  path: string | null,
  changed: boolean,
  showDiff: boolean,
  onShowDiff: (show: boolean) => void,
) {
  const [preview, setPreview] = useState(rememberedPreview);
  const [zoom, setZoom] = useState(rememberedZoom);
  const markdown = !!path && isMarkdownPath(path);
  const showingDiff = changed && showDiff;
  const previewing = markdown && preview && !showingDiff;
  const view: FileView = showingDiff ? "diff" : previewing ? "preview" : "source";

  const options = useMemo<readonly FileViewOption[] | null>(() => {
    const out = changed ? [DIFF] : [];
    out.push(...(markdown ? [PREVIEW, SOURCE] : [FILE]));
    return out.length > 1 ? out : null;
  }, [changed, markdown]);

  const select = useCallback(
    (next: FileView) => {
      onShowDiff(next === "diff");
      if (next === "diff") return;
      rememberedPreview = next === "preview";
      setPreview(rememberedPreview);
    },
    [onShowDiff],
  );

  const apply = useCallback((value: number) => {
    rememberedZoom = clamp(value);
    setZoom(rememberedZoom);
  }, []);

  const reader: ReaderZoom = {
    zoom,
    percent: Math.round(zoom * 100),
    canZoomIn: zoom < ZOOM_MAX,
    canZoomOut: zoom > ZOOM_MIN,
    zoomIn: () => apply(zoom + ZOOM_STEP),
    zoomOut: () => apply(zoom - ZOOM_STEP),
    reset: () => apply(1),
  };

  return { view, options, previewing, select, zoom: reader };
}
