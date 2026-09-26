import { runOriginAction } from "../originActions";
import { originActionLabel, originActionTitle, originMark } from "../originStatus";
import { useOriginStatus } from "../store/originStatus";

const FILL = {
  incoming:
    "bg-[var(--origin-fill)] text-[var(--origin-label)] shadow-[inset_0_0_0_1px_var(--origin-ring)] hover:bg-[var(--origin-fill-hover)]",
  conflict:
    "bg-[color-mix(in_srgb,var(--accent-red)_22%,var(--bg-hover))] text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--accent-red)_34%,var(--bg-hover))]",
};

// The hover button over a project row's origin mark: Pull, Sync, Update or
// Resolve. It sits beside the row's own button rather than inside it, and lines
// up with the invisible label SidebarOriginMark leaves in the row.
export function SidebarOriginAction({
  root,
  projectName,
  className,
  onResolve,
}: {
  root: string;
  projectName: string;
  className: string;
  onResolve: () => void;
}) {
  const entry = useOriginStatus((s) => s.entries[root]);
  const mark = entry && !entry.running && !entry.done ? originMark(entry.status) : null;
  if (!entry || !mark) return null;
  const conflict = mark.kind === "conflict";
  const title = originActionTitle(mark, entry.status.branch);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (conflict) onResolve();
        else void runOriginAction(root, mark);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title={title}
      aria-label={`${title} (${projectName})`}
      className={`absolute ${className} flex h-[22px] -translate-y-1/2 items-center rounded-md px-2 text-[11px] font-medium tabular-nums opacity-0 pointer-events-none transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 ${
        conflict ? FILL.conflict : FILL.incoming
      }`}
    >
      {originActionLabel(mark)}
    </button>
  );
}
