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
      <div className="terminal-drop-ring absolute inset-2.5 rounded-2xl" />
      <div className="terminal-drop-content relative flex flex-col items-center gap-3.5">
        <DownloadIcon size={34} />
        <p className="text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">
          {label}
        </p>
      </div>
    </div>
  );
}
