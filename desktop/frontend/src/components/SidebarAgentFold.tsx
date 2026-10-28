import { ChevronRight } from "lucide-react";
import type { PointerEvent } from "react";
import { MARK_SLOT } from "./AgentStateIcon";

const stopPointer = (e: PointerEvent) => e.stopPropagation();

interface SidebarAgentFoldProps {
  count: number;
  expanded: boolean;
  lead: string;
  onToggle: () => void;
  onArchive: () => void;
}

/** The line a project's older seen agents fold into, past the number Settings
 *  shows. It opens them in place, and archives them in one go. */
export function SidebarAgentFold({ count, expanded, lead, onToggle, onArchive }: SidebarAgentFoldProps) {
  return (
    <div className="group/fold relative">
      <button
        type="button"
        onClick={onToggle}
        onPointerDown={stopPointer}
        aria-expanded={expanded}
        className={`flex w-full select-none items-center gap-2 rounded-md py-1 pr-3 text-left text-[11px] text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-cyan)]/60 ${lead}`}
      >
        <span className={`${MARK_SLOT} flex items-center justify-center`}>
          <ChevronRight size={11} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
        </span>
        <span className="min-w-0 flex-1 truncate">{expanded ? "Show fewer" : `${count} more seen`}</span>
      </button>
      {!expanded && (
        <button
          type="button"
          onClick={onArchive}
          onPointerDown={stopPointer}
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] opacity-0 outline-none transition-opacity hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]/60 group-hover/fold:pointer-events-auto group-hover/fold:opacity-100 group-focus-within/fold:pointer-events-auto group-focus-within/fold:opacity-100"
        >
          Archive {count}
        </button>
      )}
    </div>
  );
}
