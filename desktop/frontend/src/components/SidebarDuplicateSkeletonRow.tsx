import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { ROW_BASE_CLASS, ROW_INDENT_CLASS } from "./sidebarRowClass";

interface SidebarDuplicateSkeletonRowProps {
  parentLabel: string;
  label: string;
  worktree: boolean;
  indented: boolean;
}

// An unlabelled copy is named after its parent plus a short suffix.
const UNLABELLED_SUFFIX = 2;
const MIN_NAME_CH = 6;
const MAX_NAME_CH = 22;

// The slot a copy is about to take, drawn in the shape of the row that will
// replace it: the status dot's spot, then a bar about as long as the name the
// copy is going to have, so nothing shifts when it lands.
export function SidebarDuplicateSkeletonRow({
  parentLabel,
  label,
  worktree,
  indented,
}: SidebarDuplicateSkeletonRowProps) {
  const reducedMotion = usePrefersReducedMotion();
  const nameLength = label ? label.length : parentLabel.length + UNLABELLED_SUFFIX;
  const width = `${Math.min(MAX_NAME_CH, Math.max(MIN_NAME_CH, nameLength))}ch`;

  return (
    <div
      role="status"
      aria-label={`Creating ${worktree ? "worktree" : "duplicate"} of ${parentLabel}`}
      title={`Creating ${worktree ? "worktree" : "duplicate"}…`}
      className={`${ROW_BASE_CLASS} ${indented ? ROW_INDENT_CLASS : ""} ${
        reducedMotion ? "" : "animate-pulse"
      }`}
    >
      <span className="flex h-5 shrink-0 items-center">
        <span className="h-2 w-2 rounded-full bg-[var(--bg-hover)]" />
      </span>
      <span className="flex h-5 min-w-0 items-center">
        <span className="h-3 max-w-full rounded bg-[var(--bg-hover)]" style={{ width }} />
      </span>
    </div>
  );
}
