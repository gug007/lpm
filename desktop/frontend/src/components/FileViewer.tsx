import { useContentZoom } from "../hooks/useContentZoom";
import { useEditorZoom } from "../hooks/useEditorZoom";
import { useEventListener } from "../hooks/useEventListener";
import { FileViewerCompactHeader } from "./FileViewerCompactHeader";
import { FileViewerContent } from "./FileViewerContent";
import { FileViewerHeader } from "./FileViewerHeader";
import { MINI_AUDIO, miniSize, type FileViewerLayout } from "./fileViewerLayout";
import { isSourceImage } from "./fileMedia";
import { canDownloadFrom, downloadFile } from "./files/downloadFile";
import { isMarkdownPath } from "./files/useFileView";
import { isHtmlPath } from "./htmlPreview";
import { useImagePreview } from "./imagePreview";
import { useMediaPreview } from "./mediaPreview";
import { usePdfPreview } from "./pdfPreview";
import { DiffConflictBanner } from "./review/DiffConflictBanner";
import { useFileViewerFile } from "./useFileViewerFile";
import { useFileViewerView } from "./useFileViewerView";
import { matchesChord } from "../keys";
import { useAppStore } from "../store/app";

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
  // Minimize and dock are offered only when the host lays the viewer out.
  layout?: FileViewerLayout;
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
  layout,
  onClose,
}: FileViewerProps) {
  const mode = layout?.mode ?? "open";
  const file = useFileViewerFile(absPath, projectRoot);
  const { buffer } = file;
  const svg = file.kind === "image" && isSourceImage(absPath);
  const html = isHtmlPath(absPath);
  const textView = useFileViewerView({
    line,
    renders: svg || html || isMarkdownPath(absPath),
    hasText: file.text,
    hasDiff: file.original !== null,
    deleted: file.deleted,
    ready: !file.loading,
  });

  const showImage = file.kind === "image" && (!svg || (!editing && textView.view === "preview"));
  const showVideo = file.kind === "video";
  const showAudio = file.kind === "audio";
  const showPdf = file.kind === "pdf";
  const image = useImagePreview(absPath, showImage);
  const playback = useMediaPreview(absPath, showVideo ? "video" : showAudio ? "audio" : null);
  const pdf = usePdfPreview(absPath, showPdf);
  // The previews whose zoom the header drives.
  const zoomed = showImage ? image : showPdf ? pdf : null;
  const playing = showVideo || showAudio;
  const media = !!zoomed || playing;
  const previewing = !editing && !media && textView.view === "preview";
  // A page sizes its own text, and keys pressed in it stay in its frame.
  const zoomsText = previewing && !html;
  const inEditor =
    !file.loading &&
    !media &&
    !previewing &&
    (textView.view === "diff" ? file.original !== null : file.text);
  const textZoom = useContentZoom(zoomsText);
  const editorZoom = useEditorZoom(inEditor);

  const meta = zoomed?.meta ?? (playing ? playback.meta : null);
  const mini =
    mode !== "minimized"
      ? null
      : showAudio
        ? MINI_AUDIO
        : miniSize(showVideo ? playback.size : showImage ? image.natural : null, showVideo || showImage);
  const frameStyle = mini
    ? { width: mini.w, height: mini.h }
    : mode === "docked"
      ? { width: layout?.dockWidth }
      : undefined;

  const downloads = useAppStore((s) =>
    canDownloadFrom(
      file.root,
      s.projects.find((p) => p.root === projectRoot),
    ),
  );
  const canEdit = file.text && !!buffer.file?.writable && !playing && !(showImage && !svg);
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
  // terminal tab underneath it. Minimized or docked, the keys are the app's.
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
    mode === "open",
    true,
  );

  return (
    <div
      style={frameStyle}
      className={
        mode === "open"
          ? "flex h-[90vh] w-[min(1480px,calc(100vw-32px))] flex-col"
          : `relative flex flex-col ${mode === "docked" ? "h-full" : ""}`
      }
    >
      {layout && mode !== "open" ? (
        <FileViewerCompactHeader
          absPath={absPath}
          meta={meta}
          mode={mode}
          onModeChange={layout.onModeChange}
          onClose={onClose}
        />
      ) : (
        <FileViewerHeader
          absPath={absPath}
          label={file.label}
          line={line}
          col={col}
          meta={meta}
          statusLabel={file.statusLabel}
          views={
            textView.options
              ? { value: textView.view, options: textView.options, onChange: textView.select }
              : null
          }
          zoom={zoomed?.zoom ?? (zoomsText ? textZoom : inEditor ? editorZoom : null)}
          edit={{
            editing,
            canEdit,
            dirty,
            saving: buffer.saving,
            onEdit: startEdit,
            onCancel: cancelEdit,
            onSave: () => void save(),
          }}
          onDownload={downloads ? () => void downloadFile(file.root, file.rel) : undefined}
          onMinimize={layout && (() => layout.onModeChange("minimized"))}
          onDock={layout && (() => layout.onModeChange("docked"))}
          onClose={onClose}
        />
      )}
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
          video={showVideo ? playback : null}
          audio={showAudio ? playback : null}
          pdf={showPdf ? pdf : null}
          compact={mode === "minimized"}
          textZoom={textZoom}
          onChange={buffer.setDraft}
          onSave={() => void save()}
        />
      </div>
      {layout && mode === "docked" && (
        <div
          onMouseDown={layout.onDockResizeStart}
          aria-hidden
          className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 hover:before:bg-[var(--accent-cyan)]/30 active:before:bg-[var(--accent-cyan)]/50"
        />
      )}
    </div>
  );
}
