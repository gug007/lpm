import { DownloadIcon } from "../icons";

interface TerminalDropOverlayProps {
  fileCount?: number;
  label?: string;
  // Smaller, horizontal layout for short targets like the composer input.
  compact?: boolean;
}

export function TerminalDropOverlay({ fileCount = 1, label, compact = false }: TerminalDropOverlayProps) {
  const text =
    label ?? (fileCount > 1 ? `Drop ${fileCount} files to add` : "Drop file to add");
  return (
    <div className="terminal-drop-overlay pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-[inherit]">
      <div className="terminal-drop-tint absolute inset-0" />
      <div className={`terminal-drop-ring absolute rounded-2xl ${compact ? "inset-1.5" : "inset-2.5"}`} />
      <div
        className={`terminal-drop-content relative flex items-center ${
          compact ? "flex-row gap-2" : "flex-col gap-3.5"
        }`}
      >
        <DownloadIcon size={compact ? 18 : 34} />
        <p
          className={`font-semibold tracking-tight text-[var(--text-primary)] ${
            compact ? "text-[12px]" : "text-[14px]"
          }`}
        >
          {text}
        </p>
      </div>
    </div>
  );
}
