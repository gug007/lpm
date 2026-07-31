import { PlusIcon } from "../icons";

// Every list in this pane ends the same way: one row that adds to it. Same
// shape whether it opens a form, mints an invite, or reaches for SSH, so the way
// to add a machine never has to be found twice.
export function AddRow({
  title,
  description,
  busy = false,
  expanded = false,
  onClick,
}: {
  title: string;
  description: string;
  busy?: boolean;
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-expanded={expanded}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-60"
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--border)] transition-transform ${
          expanded ? "rotate-45 text-[var(--text-secondary)]" : "text-[var(--text-muted)]"
        }`}
      >
        <PlusIcon />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-[11px] text-[var(--text-muted)]">{description}</p>
      </div>
    </button>
  );
}
