import { count } from "../../count";
import { useServiceLogs } from "../../store/serviceLogs";
import { Tooltip } from "../ui/Tooltip";

/** How many errors a service has logged since it started, on its tab. A click
 *  shows just those errors. */
export function ServiceErrorBadge({ sessionKey, onShow }: { sessionKey: string; onShow: () => void }) {
  const errors = useServiceLogs((s) => s.counts[sessionKey]?.errors ?? 0);
  if (errors === 0) return null;
  return (
    <Tooltip content={`${count(errors, "error", "errors")} logged. Click to show them.`} side="bottom">
      <span
        role="button"
        aria-label={`Show ${errors} errors`}
        onClick={(e) => {
          e.stopPropagation();
          onShow();
        }}
        className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[var(--accent-red)]/15 px-1 font-sans text-[10px] font-semibold tabular-nums text-[var(--accent-red-text)] transition-colors hover:bg-[var(--accent-red)]/25"
      >
        {errors > 99 ? "99+" : errors}
      </span>
    </Tooltip>
  );
}
