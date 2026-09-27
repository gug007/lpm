import { useEffect, useMemo, useState } from "react";

export type FileViewerView = "diff" | "preview" | "source";

interface FileViewerViewOption {
  value: FileViewerView;
  label: string;
}

const DIFF: FileViewerViewOption = { value: "diff", label: "Diff" };
const PREVIEW: FileViewerViewOption = { value: "preview", label: "Preview" };
const SOURCE: FileViewerViewOption = { value: "source", label: "Source" };
const FILE: FileViewerViewOption = { value: "source", label: "File" };

interface ViewInputs {
  line: number;
  // Markdown and SVG render; their text is a click away.
  renders: boolean;
  // There is text on disk to show as source.
  hasText: boolean;
  // There is a HEAD side to compare against.
  hasDiff: boolean;
  deleted: boolean;
  // The file has loaded; the view it opened on is kept from then on.
  ready: boolean;
}

// A rendered file opens rendered and a changed file on its diff, unless the
// link names a line: then the file itself opens there, since a diff hides the
// lines around its changes. A deleted file has only its diff. Once shown, the
// view holds while the file changes underneath it.
export function useFileViewerView({ line, renders, hasText, hasDiff, deleted, ready }: ViewInputs) {
  const [picked, setPicked] = useState<FileViewerView | null>(null);
  const [opened, setOpened] = useState<FileViewerView | null>(null);

  const options = useMemo<readonly FileViewerViewOption[] | null>(() => {
    if (!hasText) return null;
    const out = hasDiff ? [DIFF] : [];
    out.push(...(renders ? [PREVIEW, SOURCE] : [FILE]));
    return out.length > 1 ? out : null;
  }, [hasText, hasDiff, renders]);

  const fallback: FileViewerView =
    hasDiff && (deleted || !hasText)
      ? "diff"
      : line > 0
        ? "source"
        : renders
          ? "preview"
          : hasDiff
            ? "diff"
            : "source";
  const offered = (v: FileViewerView | null): v is FileViewerView =>
    v !== null && (options ? options.some((o) => o.value === v) : v === fallback);
  const view = [picked, opened].find(offered) ?? fallback;

  useEffect(() => {
    if (ready && opened === null) setOpened(fallback);
  }, [ready, opened, fallback]);

  return { view, options, select: setPicked };
}
