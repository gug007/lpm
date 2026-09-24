import { useEffect, useMemo, useState } from "react";
import { isMarkdownPath } from "./files/useFileView";

export type FileViewerView = "diff" | "preview" | "source";

interface FileViewerViewOption {
  value: FileViewerView;
  label: string;
}

const DIFF: FileViewerViewOption = { value: "diff", label: "Diff" };
const PREVIEW: FileViewerViewOption = { value: "preview", label: "Preview" };
const SOURCE: FileViewerViewOption = { value: "source", label: "Source" };

// Markdown opens rendered, with its source and any changes a click away; a link
// to a specific line opens where that line shows. Other text shows its changes
// when it has them. Each file opens on its default again.
export function useFileViewerView(
  absPath: string,
  line: number,
  hasDiff: boolean,
  hasSource: boolean,
) {
  const [picked, setPicked] = useState<FileViewerView | null>(null);
  useEffect(() => setPicked(null), [absPath]);

  const markdown = hasSource && isMarkdownPath(absPath);
  const fallback: FileViewerView =
    markdown && line <= 0 ? "preview" : hasDiff ? "diff" : "source";
  const view =
    markdown && picked && (picked !== "diff" || hasDiff) ? picked : fallback;

  const options = useMemo<readonly FileViewerViewOption[] | null>(() => {
    if (!markdown) return null;
    return hasDiff ? [DIFF, PREVIEW, SOURCE] : [PREVIEW, SOURCE];
  }, [markdown, hasDiff]);

  return { view, options, select: setPicked };
}
