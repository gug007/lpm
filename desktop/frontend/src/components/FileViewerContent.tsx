import type { ContentZoom } from "../hooks/useContentZoom";
import { uriPath } from "../path";
import { formatBytes } from "../syncApi";
import { FileViewerMarkdown } from "./FileViewerMarkdown";
import { ImageFileView } from "./ImageFileView";
import { MonacoEditor } from "./MonacoEditor";
import { PdfFileView } from "./PdfFileView";
import { VideoFileView } from "./VideoFileView";
import { FilesDiffEditor } from "./files/FilesDiffEditor";
import type { OpenFile } from "./files/useFileBuffer";
import type { ImagePreview } from "./imagePreview";
import type { PdfPreview } from "./pdfPreview";
import { BinaryFilePlaceholder } from "./review/BinaryFilePlaceholder";
import type { FileViewerView } from "./useFileViewerView";
import type { VideoPreview } from "./videoPreview";

interface FileViewerContentProps {
  absPath: string;
  projectRoot: string;
  line: number;
  col: number;
  view: FileViewerView;
  loading: boolean;
  error: string | null;
  file: OpenFile | null;
  value: string;
  // HEAD text, set when the file has a diff to show.
  original: string | null;
  deleted: boolean;
  editing: boolean;
  image: ImagePreview | null;
  video: VideoPreview | null;
  pdf: PdfPreview | null;
  textZoom: ContentZoom;
  onChange: (text: string) => void;
  onSave: () => void;
}

export function FileViewerContent({
  absPath,
  projectRoot,
  line,
  col,
  view,
  loading,
  error,
  file,
  value,
  original,
  deleted,
  editing,
  image,
  video,
  pdf,
  textZoom,
  onChange,
  onSave,
}: FileViewerContentProps) {
  if (video) return <VideoFileView video={video} />;
  if (image) return <ImageFileView preview={image} />;
  if (pdf) return <PdfFileView pdf={pdf} />;
  if (loading || !file) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }
  if (view === "diff" && original !== null) {
    return (
      <FilesDiffEditor
        path={file.path}
        original={original}
        value={deleted ? "" : value}
        onChange={onChange}
        onSave={onSave}
        readOnly={!editing || deleted || !file.writable}
      />
    );
  }
  if (error) return <BinaryFilePlaceholder path={absPath} message={error} />;
  if (file.binary) return <BinaryFilePlaceholder path={absPath} />;
  if (file.tooLarge) {
    return (
      <BinaryFilePlaceholder
        path={absPath}
        message={`Too large to preview (${formatBytes(file.size)}) — open it in another app`}
      />
    );
  }
  if (view === "preview") {
    return (
      <FileViewerMarkdown text={value} absPath={absPath} projectRoot={projectRoot} zoom={textZoom} />
    );
  }
  return (
    <MonacoEditor
      value={value}
      onChange={onChange}
      modelUri={`lpm-file://${uriPath(absPath)}`}
      perInstance
      onSave={onSave}
      readOnly={!editing}
      reveal={{ line, col }}
    />
  );
}
