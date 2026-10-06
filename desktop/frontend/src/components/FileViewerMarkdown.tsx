import { useCallback } from "react";
import type { ContentZoom } from "../hooks/useContentZoom";
import { joinAbs, relTo, splitRoot } from "../path";
import { peerSlugOf, prefixRoot, stripMarker, windowsRootMarker } from "../peer/markers";
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
  // A Windows host's drive or share root keeps the marker that routes there.
  const slug = windowsRootMarker(absPath) ? null : peerSlugOf(absPath);
  const outside = splitRoot(slug ? stripMarker(absPath) : absPath);
  const root = inProject ? projectRoot : slug ? prefixRoot(slug, "/") : outside.root;
  const path = inProject ? relTo(absPath, projectRoot) : outside.rest;
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
