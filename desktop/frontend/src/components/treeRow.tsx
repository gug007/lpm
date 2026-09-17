// The pieces every file-tree row shares: indent geometry, the disclosure
// triangle, and the unsaved-changes dot. Used by the changed-files trees, the
// diff review tree and the Files tab.

export const INDENT_PX = 14;
export const BASE_LEFT_PX = 10;

export function TreeChevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={`w-3 shrink-0 text-center text-[10px] text-[var(--text-muted)] transition-transform duration-150 ${
        open ? "rotate-90" : ""
      }`}
    >
      &#9654;
    </span>
  );
}

export function DirtyDot() {
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-cyan)]"
      title="Unsaved changes"
    />
  );
}
