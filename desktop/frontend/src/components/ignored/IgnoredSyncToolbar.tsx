import { Search } from "lucide-react";

interface IgnoredSyncToolbarProps {
  query: string;
  onQuery: (q: string) => void;
  onSuggested: () => void;
  onEnvFiles: () => void;
  onNone: () => void;
  onCollapse: () => void;
}

const CHIP =
  "rounded-full border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]";

export function IgnoredSyncToolbar({ query, onQuery, onSuggested, onEnvFiles, onNone, onCollapse }: IgnoredSyncToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] px-6 py-2.5">
      <span className="mr-0.5 text-[12px] text-[var(--text-muted)]">Tick</span>
      <button type="button" onClick={onSuggested} className={CHIP}>
        Suggested
      </button>
      <button type="button" onClick={onEnvFiles} className={CHIP}>
        All .env files
      </button>
      <button type="button" onClick={onNone} className={CHIP}>
        None
      </button>
      <span className="flex-1" />
      <label className="flex w-[240px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5">
        <Search size={13} className="shrink-0 text-[var(--text-muted)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Find a file or folder"
          aria-label="Find a file or folder"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
      </label>
      <button
        type="button"
        onClick={onCollapse}
        className="rounded-md px-2 py-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
      >
        Collapse all
      </button>
    </div>
  );
}
