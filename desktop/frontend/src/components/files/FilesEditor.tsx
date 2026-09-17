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
import type { OpenFile } from "./useFileBuffer";

interface FilesEditorProps {
  file: OpenFile | null;
  value: string;
  absPath: string;
  onChange: (text: string) => void;
  onSave: () => void;
}

// Here, where files are edited, an SVG opens as the source it is.
function mediaOf(path: string | null) {
  return path && !isSourceImage(path) ? mediaKind(path) : null;
}

export function FilesEditor({ file, value, absPath, onChange, onSave }: FilesEditorProps) {
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
  if (file.loading) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-[var(--text-muted)]">
        Loading…
      </div>
    );
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
