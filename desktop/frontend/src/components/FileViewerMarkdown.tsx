import { useCallback } from "react";
import type { ContentZoom } from "../hooks/useContentZoom";
import { joinAbs, relTo } from "../path";
import { openFileViewer } from "../store/fileViewer";
import { FilesMarkdownPreview } from "./files/FilesMarkdownPreview";

interface FileViewerMarkdownProps {
  text: string;
  absPath: string;
  projectRoot: string;
  zoom: ContentZoom;
}

// Links and images resolve against the project, or against the filesystem for
// a file outside one; a linked file opens in this viewer in place of this one.
export function FileViewerMarkdown({ text, absPath, projectRoot, zoom }: FileViewerMarkdownProps) {
  const inProject = !!projectRoot && relTo(absPath, projectRoot) !== absPath;
  const root = inProject ? projectRoot : "/";
  const onOpenFile = useCallback(
    (path: string) =>
      openFileViewer({ absPath: joinAbs(root, path), line: 0, col: 0, projectRoot }),
    [root, projectRoot],
  );

  return (
    <FilesMarkdownPreview
      text={text}
      path={relTo(absPath, root)}
      zoom={zoom}
      projectRoot={root}
      onOpenFile={onOpenFile}
    />
  );
}
