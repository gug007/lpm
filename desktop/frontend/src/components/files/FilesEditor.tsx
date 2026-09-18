import { formatBytes } from "../../syncApi";
import { FolderIcon } from "../icons";
import { ImageFileView } from "../ImageFileView";
import { MonacoEditor } from "../MonacoEditor";
import { VideoFileView } from "../VideoFileView";
import { isSourceImage, mediaKind } from "../fileMedia";
import { useImagePreview } from "../imagePreview";
import { BinaryFilePlaceholder } from "../review/BinaryFilePlaceholder";
import { EmptyState } from "../ui/EmptyState";
import { useVideoPreview } from "../videoPreview";
import { FilesDiffEditor } from "./FilesDiffEditor";
import { FilesMarkdownPreview, type MarkdownPreviewOptions } from "./FilesMarkdownPreview";
import type { DiffSource } from "./useDiffView";
import type { OpenFile } from "./useFileBuffer";

interface FilesEditorProps {
  file: OpenFile | null;
  value: string;
  absPath: string;
  // Set to show the file against HEAD instead of on its own.
  diff: DiffSource | null;
  // Set to render the file (Markdown) instead of editing its source.
  markdown: MarkdownPreviewOptions | null;
  onChange: (text: string) => void;
  onSave: () => void;
}

const LOADING = (
  <div className="flex h-full items-center justify-center text-[11px] text-[var(--text-muted)]">
    Loading…
  </div>
);

// Here, where files are edited, an SVG opens as the source it is.
function mediaOf(path: string | null) {
  return path && !isSourceImage(path) ? mediaKind(path) : null;
}

export function FilesEditor({
  file,
  value,
  absPath,
  diff,
  markdown,
  onChange,
  onSave,
}: FilesEditorProps) {
  const media = mediaOf(file?.path ?? null);
  // A preview stays decoded while its tab is hidden; a tab comes back often.
  const preview = useImagePreview(absPath, media === "image");
  const video = useVideoPreview(absPath, media === "video");

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<FolderIcon />}
          title="Select a file"
          body="Pick one from the tree, or filter by name."
        />
      </div>
    );
  }
  if (file.loading) return LOADING;
  if (diff) {
    const { head, deleted } = diff;
    if (head.status === "loading") return LOADING;
    if (head.status === "error") {
      return <BinaryFilePlaceholder path={file.path} message={head.message} />;
    }
    // A deleted file has nothing on disk to read; its diff is HEAD against
    // nothing. Anything else needs readable text on both sides.
    const textual = deleted || (!file.error && !file.binary && !file.tooLarge);
    if (head.status === "ready" && textual) {
      return (
        <FilesDiffEditor
          path={file.path}
          original={head.original}
          value={deleted ? "" : value}
          onChange={onChange}
          onSave={onSave}
          readOnly={deleted || !file.writable}
        />
      );
    }
  }
  if (file.error) return <BinaryFilePlaceholder path={file.path} message={file.error} />;
  if (media === "video") return <VideoFileView video={video} />;
  if (media === "image") return <ImageFileView preview={preview} />;
  if (file.binary) return <BinaryFilePlaceholder path={file.path} />;
  if (file.tooLarge) {
    return (
      <BinaryFilePlaceholder
        path={file.path}
        message={`Too large to open here (${formatBytes(file.size)}) — use Open to view it elsewhere`}
      />
    );
  }
  if (markdown) {
    return <FilesMarkdownPreview text={value} path={file.path} {...markdown} />;
  }
  return (
    <MonacoEditor
      key={file.path}
      value={value}
      onChange={onChange}
      modelUri={`lpm-files://${absPath}`}
      perInstance
      onSave={onSave}
      readOnly={!file.writable}
    />
  );
}
