import { useCallback } from "react";
import type { ContentZoom } from "../hooks/useContentZoom";
import { joinAbs, relTo } from "../path";
import { peerSlugOf, prefixRoot, stripMarker } from "../peer/markers";
import { openFileViewer } from "../store/fileViewer";
import { FilesMarkdownPreview } from "./files/FilesMarkdownPreview";

interface FileViewerMarkdownProps {
  text: string;
  absPath: string;
  projectRoot: string;
  zoom: ContentZoom;
}

// Links and images resolve against the project, or against the filesystem of
// the machine the file is on for a file outside one; a linked file opens in
// this viewer in place of this one.
export function FileViewerMarkdown({ text, absPath, projectRoot, zoom }: FileViewerMarkdownProps) {
  const inProject = !!projectRoot && relTo(absPath, projectRoot) !== absPath;
  const slug = peerSlugOf(absPath);
  const root = inProject ? projectRoot : slug ? prefixRoot(slug, "/") : "/";
  const path = inProject ? relTo(absPath, projectRoot) : relTo(stripMarker(absPath), "/");
  const onOpenFile = useCallback(
    (target: string) =>
      openFileViewer({ absPath: joinAbs(root, target), line: 0, col: 0, projectRoot }),
    [root, projectRoot],
  );

  return (
    <FilesMarkdownPreview
      text={text}
      path={path}
      zoom={zoom}
      projectRoot={root}
      onOpenFile={onOpenFile}
    />
  );
}
