import { basename } from "../../path";

interface DiffConflictBannerProps {
  path: string;
  onOverwrite: () => void;
  onUseTheirs: () => void;
  onDismiss: () => void;
}

export function DiffConflictBanner({
  path,
  onOverwrite,
  onUseTheirs,
  onDismiss,
}: DiffConflictBannerProps) {
  const name = basename(path);
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--accent-red)]/30 bg-[var(--accent-red)]/[0.08] px-3 py-2">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-red)]" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--text-primary)]">{name}</span> changed
        on disk while you were editing.
      </span>
      <button
        onClick={onUseTheirs}
        className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        Use theirs
      </button>
      <button
        onClick={onOverwrite}
        className="shrink-0 rounded-md bg-[var(--accent-red)] px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
      >
        Keep mine
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        Later
      </button>
    </div>
  );
}
