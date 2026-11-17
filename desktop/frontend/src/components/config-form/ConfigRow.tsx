import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { TrashIcon } from "../icons";
import { ICON_ACTION_DANGER } from "../ui/buttons";

interface ConfigRowProps {
  label: string;
  // What the row runs, shown beside the name while it's collapsed.
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  children: ReactNode;
}

export function ConfigRow({ label, subtitle, expanded, onToggle, onDelete, children }: ConfigRowProps) {
  return (
    <div className={expanded ? "bg-[var(--bg-secondary)]/40" : ""}>
      <div className="group flex h-9 items-center gap-1 pl-2 pr-1.5 transition-colors hover:bg-[var(--bg-hover)]/60">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            size={14}
            strokeWidth={2}
            aria-hidden
            className={`shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          />
          <span className="w-[180px] shrink-0 truncate text-[13px] font-medium text-[var(--text-primary)]">
            {label || "untitled"}
          </span>
          {subtitle && !expanded && (
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-muted)]">{subtitle}</span>
          )}
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Remove ${label || "item"}`}
          title="Remove"
          className={`${ICON_ACTION_DANGER} opacity-0 transition-all! focus-visible:opacity-100 group-hover:opacity-100`}
        >
          <TrashIcon size={13} />
        </button>
      </div>
      {expanded && <div className="flex flex-col gap-4 pb-5 pl-[30px] pr-4 pt-2">{children}</div>}
    </div>
  );
}
