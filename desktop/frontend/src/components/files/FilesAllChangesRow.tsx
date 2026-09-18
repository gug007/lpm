import { LayersIcon } from "../icons";
import { BASE_LEFT_PX } from "../treeRow";

interface FilesAllChangesRowProps {
  count: number;
  selected: boolean;
  onToggle: () => void;
}

// Above the changed files: the whole working tree as one stack of diffs.
export function FilesAllChangesRow({ count, selected, onToggle }: FilesAllChangesRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      style={{ paddingLeft: `${BASE_LEFT_PX}px` }}
      title="Show every change as one diff"
      className={`flex w-full select-none items-center gap-1.5 py-[5px] pr-2.5 text-left transition-colors ${
        selected
          ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span className="flex w-[26px] shrink-0 items-center justify-center text-[var(--text-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">
        <LayersIcon />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium">View all changes</span>
      <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{count}</span>
    </button>
  );
}
