import { useId } from "react";
import { ChevronDown } from "lucide-react";
import DialogCopyOverride from "./dialog-copy-override";
import {
  copyLabel,
  overrideSummary,
  type CopyDraft,
  type CopyRunMode,
} from "./dialog-data";
import { FIELD } from "./dialog-styles";

export default function DialogCopyRow({
  index,
  copy,
  expanded,
  onToggle,
  onModeChange,
}: {
  index: number;
  copy: CopyDraft;
  expanded: boolean;
  onToggle: () => void;
  onModeChange: (next: CopyRunMode) => void;
}) {
  const panelId = useId();
  const label = copyLabel(copy.serial);
  const summary = overrideSummary(copy.override);
  return (
    <li className="menu-pop grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2.5 sm:grid-cols-[1rem_minmax(0,1fr)_6.5rem]">
      <span
        aria-hidden
        className="text-right text-[12px] tabular-nums text-[var(--text-muted)]"
      >
        {index + 1}
      </span>
      <span className={`${FIELD} h-9 min-w-0 px-3`}>
        <span className="truncate">{label}</span>
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        aria-label={`Run on ${label}: ${summary}`}
        title={`Run on this copy — ${summary}`}
        className={`flex w-full items-center justify-end gap-1 rounded text-[12px] font-medium transition-colors ${
          copy.override
            ? "text-[var(--accent-cyan)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <DialogCopyOverride
          id={panelId}
          label={label}
          override={copy.override}
          onChange={onModeChange}
        />
      )}
    </li>
  );
}
