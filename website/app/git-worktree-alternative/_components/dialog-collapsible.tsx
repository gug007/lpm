import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { CARD, INSET_FOCUS, SECTION_LABEL } from "./dialog-styles";

export default function DialogCollapsible({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <div className={`${CARD} overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]/30 ${INSET_FOCUS}`}
      >
        <span className={`${SECTION_LABEL} shrink-0`}>{title}</span>
        {!open && (
          <span className="min-w-0 flex-1 truncate text-right text-[12px] text-[var(--text-muted)]">
            {summary}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${
            open ? "ml-auto" : "-rotate-90"
          }`}
        />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="border-t border-[var(--border)]"
      >
        {children}
      </div>
    </div>
  );
}
