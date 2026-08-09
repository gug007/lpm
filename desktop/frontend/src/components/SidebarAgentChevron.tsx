import { ChevronRightIcon } from "./icons";

/** The control that opens a project row's agent list. Where it sits is the
 *  row's business — a local row and a paired host's row park their trailing
 *  controls differently — so this only draws it. */
export function SidebarAgentChevron({
  expanded,
  label,
  onToggle,
}: {
  expanded: boolean;
  /** The project as the user reads it, for the row's title and label. */
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      title={expanded ? "Hide agents" : "Show agents"}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Hide" : "Show"} agents in ${label}`}
    >
      {/* Turns rather than swaps, the way a folder's arrow does. */}
      <span className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}>
        <ChevronRightIcon />
      </span>
    </button>
  );
}
