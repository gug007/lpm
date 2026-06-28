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
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--accent-red)]/40 bg-[var(--accent-red)]/10 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-primary)]">
        <span className="font-medium">{name}</span> changed on disk while you were
        editing.
      </span>
      <button
        onClick={onUseTheirs}
        className="shrink-0 rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        Use theirs
      </button>
      <button
        onClick={onOverwrite}
        className="shrink-0 rounded-md bg-[var(--accent-red)] px-2 py-0.5 text-[11px] font-medium text-white transition-opacity hover:opacity-85"
      >
        Keep mine
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        Later
      </button>
    </div>
  );
}
