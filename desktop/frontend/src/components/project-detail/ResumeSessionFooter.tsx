import { Kbd } from "../ui/Kbd";

interface ResumeSessionFooterProps {
  // Enter resumes a closed conversation but only re-focuses a live one, so the
  // hint has to follow the selection rather than state one of them as the rule.
  picksOpenTab: boolean;
  canHide: boolean;
  hiddenCount: number;
  onRestoreHidden: () => void;
  onClose: () => void;
}

const BUTTON =
  "rounded-lg px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]";

export function ResumeSessionFooter({
  picksOpenTab,
  canHide,
  hiddenCount,
  onRestoreHidden,
  onClose,
}: ResumeSessionFooterProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
      <span className="text-[11px] text-[var(--text-muted)]">
        <Kbd>↑</Kbd> <Kbd>↓</Kbd> to browse · <Kbd>↵</Kbd>{" "}
        {picksOpenTab ? "to go to its tab" : "to resume"}
        {canHide && (
          <>
            {" · "}
            <Kbd>⌘⌫</Kbd> to hide
          </>
        )}
        {" · "}
        <Kbd>esc</Kbd> to close
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {hiddenCount > 0 && (
          <button type="button" onClick={onRestoreHidden} className={BUTTON}>
            Restore {hiddenCount} hidden
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={`border border-[var(--border)] ${BUTTON}`}
        >
          Close
        </button>
      </div>
    </div>
  );
}
