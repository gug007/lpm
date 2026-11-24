import { basename } from "../path";
import type { FileViewerMode } from "../store/fileViewer";
import { MaximizeIcon, PanelRightIcon, PictureInPictureIcon, XIcon } from "./icons";

const ICON_BUTTON =
  "rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

interface FileViewerCompactHeaderProps {
  absPath: string;
  // The SSH host the file is on.
  hostName?: string;
  meta: string | null;
  mode: "minimized" | "docked";
  onModeChange: (mode: FileViewerMode) => void;
  onClose: () => void;
}

// A minimized window is dragged by this bar; both modes swap to the other
// one or back to the full viewer from here.
export function FileViewerCompactHeader({
  absPath,
  hostName,
  meta,
  mode,
  onModeChange,
  onClose,
}: FileViewerCompactHeaderProps) {
  const minimized = mode === "minimized";
  return (
    <header
      data-modal-drag-handle={minimized || undefined}
      className={`flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border)] pl-3 pr-1 ${
        minimized ? "cursor-grab select-none active:cursor-grabbing" : ""
      }`}
    >
      <span title={absPath} className="min-w-0 truncate text-[12px] font-semibold text-[var(--text-primary)]">
        {basename(absPath)}
      </span>
      {hostName && !minimized && (
        <span className="shrink-0 text-[11px] text-[var(--accent-cyan)]">On {hostName}</span>
      )}
      {meta && !minimized && (
        <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">{meta}</span>
      )}
      <span className="flex-1" />
      {minimized ? (
        <button
          type="button"
          onClick={() => onModeChange("docked")}
          aria-label="Dock to the side"
          title="Dock to the side"
          className={ICON_BUTTON}
        >
          <PanelRightIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onModeChange("minimized")}
          aria-label="Minimize"
          title="Minimize"
          className={ICON_BUTTON}
        >
          <PictureInPictureIcon />
        </button>
      )}
      <button
        type="button"
        onClick={() => onModeChange("open")}
        aria-label="Expand"
        title="Expand"
        className={ICON_BUTTON}
      >
        <MaximizeIcon />
      </button>
      <button type="button" onClick={onClose} aria-label="Close" title="Close" className={ICON_BUTTON}>
        <XIcon />
      </button>
    </header>
  );
}
