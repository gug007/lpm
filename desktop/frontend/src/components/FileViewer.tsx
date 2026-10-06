import { useContentZoom } from "../hooks/useContentZoom";
import { useEditorZoom } from "../hooks/useEditorZoom";
import { useEventListener } from "../hooks/useEventListener";
import { FileViewerContent } from "./FileViewerContent";
import { FileViewerHeader } from "./FileViewerHeader";
import { isSourceImage } from "./fileMedia";
import { isMarkdownPath } from "./files/useFileView";
import { useImagePreview } from "./imagePreview";
import { usePdfPreview } from "./pdfPreview";
import { DiffConflictBanner } from "./review/DiffConflictBanner";
import { useFileViewerFile } from "./useFileViewerFile";
import { useFileViewerView } from "./useFileViewerView";
import { useVideoPreview } from "./videoPreview";
import { matchesChord } from "../keys";

const CLOSE_CHORD = { key: "w", meta: true };

// Monaco's own popups (find, palette, go to line, context menu) take Escape
// first; with none open it reaches the dialog and closes it.
const MONACO_UI = ".monaco-editor, .quick-input-widget, .context-view, .monaco-menu-container";

interface FileViewerProps {
  absPath: string;
  line: number;
  col: number;
  projectRoot: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onClose: () => void;
}

// One file in the viewer, read-only until Edit. Mounted per file, so opening
// another one (a Markdown link) starts from a clean slate.
export function FileViewer({
  absPath,
  line,
  col,
  projectRoot,
  editing,
  onEditingChange,
  onClose,
}: FileViewerProps) {
  const file = useFileViewerFile(absPath, projectRoot);
  const { buffer } = file;
  const svg = file.kind === "image" && isSourceImage(absPath);
  const textView = useFileViewerView({
    line,
    renders: svg || isMarkdownPath(absPath),
    hasText: file.text,
    hasDiff: file.original !== null,
    deleted: file.deleted,
    ready: !file.loading,
  });

  const showImage = file.kind === "image" && (!svg || (!editing && textView.view === "preview"));
  const showVideo = file.kind === "video";
  const showPdf = file.kind === "pdf";
  const image = useImagePreview(absPath, showImage);
  const video = useVideoPreview(absPath, showVideo);
  const pdf = usePdfPreview(absPath, showPdf);
  // The previews whose zoom the header drives.
  const zoomed = showImage ? image : showPdf ? pdf : null;
  const media = !!zoomed || showVideo;
  const previewing = !editing && !media && textView.view === "preview";
  const inEditor =
    !file.loading &&
    !media &&
    !previewing &&
    (textView.view === "diff" ? file.original !== null : file.text);
  const textZoom = useContentZoom(previewing);
  const editorZoom = useEditorZoom(inEditor);

  const canEdit = file.text && !!buffer.file?.writable && !showVideo && !(showImage && !svg);
  const dirty = buffer.draft !== null;

  const startEdit = () => {
    if (textView.view === "preview") textView.select("source");
    onEditingChange(true);
  };
  // Dropping an edit that ran into a newer write shows that write, not the
  // text the edit started from.
  const cancelEdit = () => {
    if (buffer.conflict) void buffer.resolveConflict("theirs");
    else if (buffer.file) buffer.setDraft(buffer.file.baseline);
    onEditingChange(false);
  };
  const save = async () => {
    if (await buffer.save()) onEditingChange(false);
  };

  // Capture phase on window so we beat xterm's keydown handler, which calls
  // stopPropagation on keys it consumes. ⌘W closes the viewer rather than the
  // terminal tab underneath it.
  useEventListener(
    "keydown",
    (e) => {
      if (matchesChord(e, CLOSE_CHORD)) {
        e.preventDefault();
        e.stopPropagation();
        if (!editing) onClose();
        return;
      }
      if (e.key !== "Escape" || editing) return;
      // Escape out of a fullscreen video belongs to the webview; closing the
      // modal here would leave the app stuck fullscreen.
      if (document.fullscreenElement) return;
      if (e.target instanceof Element && e.target.closest(MONACO_UI)) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    },
    window,
    true,
    true,
  );

  return (
    <div className="flex h-[90vh] w-[min(1480px,calc(100vw-32px))] flex-col">
      <FileViewerHeader
        absPath={absPath}
        label={file.label}
        line={line}
        col={col}
        meta={zoomed?.meta ?? (showVideo ? video.meta : null)}
        statusLabel={file.statusLabel}
        views={
          textView.options
            ? { value: textView.view, options: textView.options, onChange: textView.select }
            : null
        }
        zoom={zoomed?.zoom ?? (previewing ? textZoom : inEditor ? editorZoom : null)}
        edit={{
          editing,
          canEdit,
          dirty,
          saving: buffer.saving,
          onEdit: startEdit,
          onCancel: cancelEdit,
          onSave: () => void save(),
        }}
        onClose={onClose}
      />
      {buffer.conflict && (
        <DiffConflictBanner
          path={buffer.conflict.path}
          onOverwrite={() => void buffer.resolveConflict("overwrite")}
          onUseTheirs={() => void buffer.resolveConflict("theirs")}
          onDismiss={() => void buffer.resolveConflict("dismiss")}
        />
      )}
      <div
        ref={zoomed?.zoom.surfaceRef}
        className="min-h-0 flex-1 overflow-hidden bg-[var(--bg-primary)]"
      >
        <FileViewerContent
          absPath={absPath}
          projectRoot={projectRoot}
          line={line}
          col={col}
          view={editing && textView.view === "preview" ? "source" : textView.view}
          loading={file.loading}
          error={file.error}
          file={buffer.file}
          value={buffer.value}
          original={file.original}
          deleted={file.deleted}
          editing={editing}
          image={showImage ? image : null}
          video={showVideo ? video : null}
          pdf={showPdf ? pdf : null}
          textZoom={textZoom}
          onChange={buffer.setDraft}
          onSave={() => void save()}
        />
      </div>
    </div>
  );
}
