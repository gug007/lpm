import { ListCollapse } from "lucide-react";
import { useServiceLogs } from "../../store/serviceLogs";
import { Tooltip } from "../ui/Tooltip";

const BASE = "flex items-center gap-1 rounded transition-colors [&>svg]:h-3 [&>svg]:w-3";
const OFF = `${BASE} p-0.5 text-[var(--terminal-header-text)] hover:bg-[var(--terminal-header-hover)] hover:text-[var(--terminal-tab-active)]`;
const ON = `${BASE} bg-[color-mix(in_srgb,var(--accent-cyan)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-cyan-text)]`;

// Folds runs of log lines that differ only in their numbers. Only the view
// changes: the service's output itself is untouched.
export function FoldRepeatsToggle({ sessionKey }: { sessionKey: string }) {
  const on = useServiceLogs((s) => Boolean(s.fold[sessionKey]));
  const setFold = useServiceLogs((s) => s.setFold);
  return (
    <Tooltip content={on ? "Show every line" : "Fold repeated lines"} side="bottom" align="end">
      <button
        type="button"
        aria-label="Fold repeated lines"
        aria-pressed={on}
        onClick={() => setFold(sessionKey, !on)}
        className={on ? ON : OFF}
      >
        <ListCollapse />
        {on && "Fold repeats"}
      </button>
    </Tooltip>
  );
}
