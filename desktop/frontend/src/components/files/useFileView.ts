import { useCallback, useMemo, useState } from "react";
import { useContentZoom } from "../../hooks/useContentZoom";
import type { useDiffView } from "./useDiffView";

export type FileView = "diff" | "preview" | "source";

export interface FileViewOption {
  value: FileView;
  label: string;
}

const PREVIEW_KEY = "lpm:filesMarkdownPreview";
const PREVIEW_ZOOM_KEY = "lpm:filesPreviewZoom";
const MARKDOWN_RE = /\.(md|markdown)$/i;

const DIFF: FileViewOption = { value: "diff", label: "Diff" };
const PREVIEW: FileViewOption = { value: "preview", label: "Preview" };
const SOURCE: FileViewOption = { value: "source", label: "Source" };
const FILE: FileViewOption = { value: "source", label: "File" };

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_RE.test(path);
}

// The ways the editor can show the open file: a changed file against HEAD, a
// Markdown file rendered, and any file as its source. Whether Markdown opens
// rendered or as source is remembered across files and sessions, as is the
// preview's zoom; its shortcuts are taken only while the pane is focused.
export function useFileView(
  path: string | null,
  diff: ReturnType<typeof useDiffView>,
  focused: boolean,
) {
  const [preview, setPreview] = useState(() => localStorage.getItem(PREVIEW_KEY) !== "0");
  const markdown = !!path && isMarkdownPath(path);
  const showingDiff = diff.diff !== null;
  const previewing = markdown && preview && !showingDiff;
  const view: FileView = showingDiff ? "diff" : previewing ? "preview" : "source";
  const zoom = useContentZoom(focused && previewing, PREVIEW_ZOOM_KEY);

  const options = useMemo<readonly FileViewOption[] | null>(() => {
    const out = diff.available ? [DIFF] : [];
    out.push(...(markdown ? [PREVIEW, SOURCE] : [FILE]));
    return out.length > 1 ? out : null;
  }, [diff.available, markdown]);

  const { setWanted } = diff;
  const select = useCallback(
    (next: FileView) => {
      setWanted(next === "diff");
      if (next === "diff") return;
      localStorage.setItem(PREVIEW_KEY, next === "preview" ? "1" : "0");
      setPreview(next === "preview");
    },
    [setWanted],
  );

  const togglePreview = useCallback(() => {
    if (markdown) select(view === "preview" ? "source" : "preview");
  }, [markdown, select, view]);

  return { view, options, previewing, select, togglePreview, zoom };
}
