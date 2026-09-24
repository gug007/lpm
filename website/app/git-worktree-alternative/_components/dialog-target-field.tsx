import { ChevronDown } from "lucide-react";
import { ACTION_LABEL, AGENT_COMMAND } from "./dialog-data";
import { FIELD } from "./dialog-styles";

export default function DialogTargetField({
  mode,
}: {
  mode: "action" | "command";
}) {
  if (mode === "action") {
    return (
      <div className="menu-pop mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5 text-[13px]">
        <span className="truncate text-[var(--text-primary)]">
          {ACTION_LABEL}
        </span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
        />
      </div>
    );
  }
  return (
    <div
      className={`${FIELD} menu-pop mt-2 min-h-9 gap-2.5 px-3 py-2 font-mono leading-snug`}
    >
      <span aria-hidden className="text-[var(--text-muted)]">
        $
      </span>
      <span>{AGENT_COMMAND}</span>
    </div>
  );
}
