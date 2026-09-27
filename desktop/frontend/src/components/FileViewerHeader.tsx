import type { ContentZoom } from "../hooks/useContentZoom";
import { basename } from "../path";
import { XIcon } from "./icons";
import { OpenFileWithDropdown } from "./OpenFileWithDropdown";
import { SegmentedControl } from "./ui/SegmentedControl";
import { ZoomControl } from "./ui/ZoomControl";
import type { FileViewerView } from "./useFileViewerView";

const CHIP =
  "rounded bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[11px] font-normal text-[var(--text-secondary)]";
const QUIET_BUTTON =
  "rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40";

interface FileViewerHeaderProps {
  absPath: string;
  label: string;
  line: number;
  col: number;
  meta: string | null;
  statusLabel: string | null;
  views: {
    value: FileViewerView;
    options: readonly { value: FileViewerView; label: string }[];
    onChange: (view: FileViewerView) => void;
  } | null;
  zoom: ContentZoom | null;
  edit: {
    editing: boolean;
    canEdit: boolean;
    dirty: boolean;
    saving: boolean;
    onEdit: () => void;
    onCancel: () => void;
    onSave: () => void;
  };
  onClose: () => void;
}

export function FileViewerHeader({
  absPath,
  label,
  line,
  col,
  meta,
  statusLabel,
  views,
  zoom,
  edit,
  onClose,
}: FileViewerHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-6 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
          <span className="truncate">{basename(absPath)}</span>
          {line > 0 && (
            <span className={CHIP}>
              :{line}
              {col > 0 ? `:${col}` : ""}
            </span>
          )}
          {meta && <span className={CHIP}>{meta}</span>}
          {statusLabel && (
            <span className="rounded bg-[var(--accent-cyan)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent-cyan)]">
              {statusLabel}
            </span>
          )}
        </div>
        <div className="truncate text-[12px] text-[var(--text-muted)]">{label}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {edit.editing ? (
          <>
            <button type="button" onClick={edit.onCancel} disabled={edit.saving} className={QUIET_BUTTON}>
              {edit.dirty ? "Cancel" : "Done"}
            </button>
            <button
              type="button"
              onClick={edit.onSave}
              disabled={edit.saving || !edit.dirty}
              className="rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-[13px] font-semibold text-[var(--bg-primary)] transition hover:opacity-90 disabled:opacity-40"
            >
              {edit.saving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <>
            {views && (
              <SegmentedControl
                value={views.value}
                options={views.options}
                onChange={views.onChange}
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
            {edit.canEdit && (
              <button type="button" onClick={edit.onEdit} className={QUIET_BUTTON}>
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
  );
}
