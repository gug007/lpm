import { DownloadIcon } from "../icons";

interface TerminalDropOverlayProps {
  fileCount: number;
}

export function TerminalDropOverlay({ fileCount }: TerminalDropOverlayProps) {
  const label =
    fileCount > 1 ? `Drop ${fileCount} files to add` : "Drop file to add";
  return (
    <div className="terminal-drop-overlay pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="terminal-drop-tint absolute inset-0" />
      <div className="terminal-drop-outline absolute inset-1.5 rounded-md" />
      <div className="terminal-drop-card relative flex flex-col items-center gap-3 rounded-xl border border-[var(--border)] px-7 py-5">
        <div className="terminal-drop-icon flex h-12 w-12 items-center justify-center rounded-full">
          <DownloadIcon size={24} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {label}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Release to attach to terminal
          </p>
        </div>
      </div>
    </div>
  );
}
