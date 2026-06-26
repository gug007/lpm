import { type ReactNode } from "react";
import { CARD_CLASS, SECTION_LABEL } from "./ui/fields";

interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  // A short, muted recap shown in the header while the section is collapsed.
  summary?: ReactNode;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  open,
  onToggle,
  summary,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className={`${CARD_CLASS} overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]/30"
      >
        <span className={`${SECTION_LABEL} shrink-0`}>{title}</span>
        {!open && summary != null && (
          <span className="min-w-0 flex-1 truncate text-right text-[12px] text-[var(--text-muted)]">
            {summary}
          </span>
        )}
        <Chevron open={open} className={open ? "ml-auto" : ""} />
      </button>
      {open && (
        <div className="border-t border-[var(--border)]">{children}</div>
      )}
    </div>
  );
}

function Chevron({
  open,
  className = "",
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "" : "-rotate-90"} ${className}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
