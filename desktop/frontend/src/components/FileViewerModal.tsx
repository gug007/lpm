import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { GitDiff, ReadFile, WriteFile } from "../../bridge/commands";
import { getLang } from "../highlight";
import { basename, relTo } from "../path";
import { useEventListener } from "../hooks/useEventListener";
import { useContentZoom } from "../hooks/useContentZoom";
import { ZoomControl } from "./ui/ZoomControl";
import { MonacoEditor } from "./MonacoEditor";
import { OpenFileWithDropdown } from "./OpenFileWithDropdown";
import { SegmentedControl } from "./ui/SegmentedControl";
import { ImageFileView } from "./ImageFileView";
import { useImagePreview } from "./imagePreview";
import { VideoFileView } from "./VideoFileView";
import { useVideoPreview } from "./videoPreview";
import { mediaKind } from "./fileMedia";
import {
  ContentView,
  SideBySideDiff,
  SIDE_BY_SIDE_MIN_PX,
  UnifiedDiff,
  buildContentLines,
  highlightContent,
  highlightDiffRows,
  parseDiffRows,
  type ContentLine,
  type DiffRow,
} from "./fileViewerDiff";

const BASE_FONT_PX = 12;

// SVG is the one image extension that is also reviewable, editable source, so
// it keeps a way back to the diff instead of only ever being rasterised.
const SOURCE_IMAGE_RE = /\.svg$/i;

const VIEW_OPTIONS = [
  { value: "preview", label: "Preview" },
  { value: "source", label: "Source" },
] as const;

function useIsWide(threshold: number): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= threshold,
  );
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= threshold);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [threshold]);
  return wide;
}

interface FileViewerModalProps {
  open: boolean;
  absPath: string;
  line: number;
  col: number;
  projectRoot: string;
  onClose: () => void;
}

export function FileViewerModal({
  open,
  absPath,
  line,
  col,
  projectRoot,
  onClose,
}: FileViewerModalProps) {
  const [diffRows, setDiffRows] = useState<DiffRow[] | null>(null);
  const [contentLines, setContentLines] = useState<ContentLine[] | null>(null);
  const [rawContent, setRawContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showSource, setShowSource] = useState(false);
  const wide = useIsWide(SIDE_BY_SIDE_MIN_PX);
  const kind = mediaKind(absPath);
  const canViewSource = kind === "image" && SOURCE_IMAGE_RE.test(absPath);
  const isImage = kind === "image" && !showSource;
  const isVideo = kind === "video";
  const isMedia = isImage || isVideo;
  // Monaco owns the zoom gestures inside its own surface, so stand down while
  // editing.
  const textZoom = useContentZoom(open && !editing && !isMedia);
  const preview = useImagePreview(absPath, open && isImage);
  const video = useVideoPreview(absPath, open && isVideo);
  // Two controllers so an image opens at fit regardless of the reader zoom the
  // text pane was left at; only one is ever enabled. Video has no fit to zoom —
  // the element sizes itself — so it gets none.
  const zoom = isVideo ? null : isImage ? preview.zoom : textZoom;

  // Capture phase on window so we beat xterm's keydown handler — xterm calls
  // stopPropagation on keys it consumes, which would otherwise eat Escape
  // before it reaches Modal's bubble-phase document listener.
  useEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      // Escape out of a fullscreen video belongs to the webview; closing the
      // modal here would leave the app stuck fullscreen.
      if (document.fullscreenElement) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    },
    window,
    open && !editing,
    true,
  );

  useEffect(() => {
    setEditing(false);
    setEditValue("");
    setSaving(false);
    setShowSource(false);
  }, [absPath]);

  useEffect(() => {
    if (!open || !absPath) return;
    setError(null);
    setDiffRows(null);
    setContentLines(null);
    setRawContent("");
    if (isMedia) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const lang = getLang(absPath);
      const rel = relTo(absPath, projectRoot);
      const [contentRes, diffRes] = await Promise.allSettled([
        ReadFile(absPath),
        projectRoot ? GitDiff(projectRoot, [rel]) : Promise.resolve(""),
      ]);
      if (cancelled) return;

      if (contentRes.status === "fulfilled") {
        setRawContent(contentRes.value);
      }

      const diffText =
        diffRes.status === "fulfilled" ? diffRes.value.trim() : "";
      if (diffText) {
        const parsed = parseDiffRows(diffText);
        if (parsed.length > 0) {
          const highlighted = await highlightDiffRows(parsed, lang);
          if (cancelled) return;
          setDiffRows(highlighted);
          setLoading(false);
          return;
        }
      }

      if (contentRes.status === "fulfilled") {
        const built = buildContentLines(contentRes.value);
        const highlighted = await highlightContent(built, lang);
        if (cancelled) return;
        setContentLines(highlighted);
      } else {
        setError(
          contentRes.reason instanceof Error
            ? contentRes.reason.message
            : String(contentRes.reason),
        );
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, absPath, projectRoot, reloadKey, isMedia]);

  const hasDiff = diffRows !== null;
  const headerLabel = projectRoot ? relTo(absPath, projectRoot) : absPath;
  const canEdit = !isMedia && !loading && !error;
  const dirty = editing && editValue !== rawContent;

  const startEdit = () => {
    setEditValue(rawContent);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditValue("");
  };
  const saveEdit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await WriteFile(absPath, editValue);
      toast.success("Saved");
      setEditing(false);
      setEditValue("");
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnEscape={!editing}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex h-[90vh] w-[min(1480px,calc(100vw-32px))] flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-6 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <span className="truncate">{basename(absPath)}</span>
              {!isMedia && line > 0 && (
                <span className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[11px] font-normal text-[var(--text-secondary)]">
                  :{line}
                  {col > 0 ? `:${col}` : ""}
                </span>
              )}
              {isImage && preview.meta && (
                <span className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[11px] font-normal text-[var(--text-secondary)]">
                  {preview.meta}
                </span>
              )}
              {isVideo && video.meta && (
                <span className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[11px] font-normal text-[var(--text-secondary)]">
                  {video.meta}
                </span>
              )}
              {hasDiff && (
                <span className="rounded bg-[var(--accent-cyan)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent-cyan)]">
                  Modified
                </span>
              )}
            </div>
            <div className="truncate text-[12px] text-[var(--text-muted)]">
              {headerLabel}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={saving || !dirty}
                  className="rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-[13px] font-semibold text-[var(--bg-primary)] transition hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <>
                {canViewSource && (
                  <SegmentedControl
                    value={showSource ? "source" : "preview"}
                    options={VIEW_OPTIONS}
                    onChange={(v) => setShowSource(v === "source")}
                    variant="subtle"
                    ariaLabel="View mode"
                  />
                )}
                {zoom && (
                  <ZoomControl
                    percent={zoom.percent}
                    onZoomIn={zoom.zoomIn}
                    onZoomOut={zoom.zoomOut}
                    onReset={zoom.zoomReset}
                    canZoomIn={zoom.canZoomIn}
                    canZoomOut={zoom.canZoomOut}
                  />
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    Edit
                  </button>
                )}
                <OpenFileWithDropdown absPath={absPath} line={line} col={col} />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <XIcon />
                </button>
              </>
            )}
          </div>
        </header>

        <div
          ref={zoom?.surfaceRef}
          className="min-h-0 flex-1 overflow-hidden bg-[var(--bg-primary)] font-mono leading-[1.55]"
          style={
            editing || isMedia
              ? undefined
              : { fontSize: `${BASE_FONT_PX * textZoom.zoom}px` }
          }
        >
          {editing ? (
            <MonacoEditor
              value={editValue}
              onChange={setEditValue}
              language={getLang(absPath)}
              modelUri={`lpm-file://${absPath}`}
              onSave={() => void saveEdit()}
            />
          ) : isVideo ? (
            <VideoFileView video={video} />
          ) : isImage ? (
            <ImageFileView preview={preview} />
          ) : (
            <>
              {loading && (
                <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-muted)]">
                  Loading…
                </div>
              )}
              {!loading && error && (
                <div className="flex h-full items-center justify-center px-8 text-center text-[13px] text-[var(--accent-red)]">
                  {error}
                </div>
              )}
              {!loading && !error && diffRows && (
                wide ? (
                  <SideBySideDiff rows={diffRows} highlightLine={line} />
                ) : (
                  <UnifiedDiff rows={diffRows} highlightLine={line} />
                )
              )}
              {!loading && !error && !diffRows && contentLines && (
                <ContentView lines={contentLines} highlightLine={line} />
              )}
              {!loading && !error && !diffRows && !contentLines && (
                <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-muted)]">
                  Empty file
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
