import { useEffect, useRef } from "react";
import type { AgentCapability } from "../../toolkit";
import { capabilityIssue, shortPath } from "../../toolkit";
import { faultState, rowMeta } from "../../toolkitRowText";
import { PencilIcon } from "../icons";
import { ROW } from "./surfaces";

interface ToolkitRowProps {
  cap: AgentCapability;
  summary: string;
  active: boolean;
  fault: boolean;
  nested: boolean;
  showCli: boolean;
  // Only for a skill lpm can rewrite; every other row leaves the gutter empty.
  onEdit?: () => void;
  onSelect: () => void;
  onActivate: () => void;
}

// Three columns and no glyph: what it is called, what it does, and the one fact
// that changes what happens. A row that is fine says nothing about being fine —
// the eye should find nothing to catch on until it reaches something amber.
export function ToolkitRow({
  cap,
  summary,
  active,
  fault,
  nested,
  showCli,
  onEdit,
  onSelect,
  onActivate,
}: ToolkitRowProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const issue = capabilityIssue(cap);
  // The pencil is drawn over the row's right edge, so only the row showing one
  // pulls its meta column in to clear it.
  const editing = Boolean(onEdit) && active;
  const meta = fault ? faultState(cap) : rowMeta(cap, showCli);
  const muted = !cap.enabled || Boolean(cap.shadowedBy);

  // Keyboard navigation drives `active`, so the row has to bring itself into
  // view — the caller does not know the scroll container's geometry.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    // The pencil is a sibling rather than something inside the row: a button
    // cannot hold another one. It renders only for the row under the cursor or
    // the caret, so the list keeps no invisible click targets and no space
    // held open for one.
    <div className="relative" onMouseMove={onSelect}>
      <button
        ref={ref}
        type="button"
        onClick={onActivate}
        aria-current={active}
        title={issue ?? cap.description ?? shortPath(cap.path)}
        className={`${ROW} ${nested ? "pl-6" : ""} ${editing ? "pr-6" : "pr-2"} ${
          fault
            ? active
              ? "bg-[var(--tk-fault-active)]"
              : "hover:bg-[var(--tk-fault-hover)]"
            : active
              ? "bg-[var(--tk-active)]"
              : "hover:bg-[var(--tk-hover)]"
        }`}
      >
        <span
          className={`max-w-[210px] truncate font-mono text-[12px] leading-4 ${
            muted && !fault ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"
          }`}
        >
          {cap.name}
        </span>

        <span
          className={`truncate text-[10.5px] leading-4 ${
            fault ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"
          }`}
        >
          {fault ? (issue ?? summary) : summary}
        </span>

        <span
          className={`whitespace-nowrap text-[10.5px] leading-4 tabular-nums ${
            fault ? "text-[var(--accent-amber-text)]" : "text-[var(--text-muted)]"
          }`}
        >
          {meta}
        </span>
      </button>

      {editing && onEdit && (
        <button
          type="button"
          onClick={onEdit}
          title="Edit this skill"
          aria-label={`Edit ${cap.name}`}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded-[6px] p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--tk-hover)] hover:text-[var(--text-primary)] [&>svg]:block"
        >
          <PencilIcon size={11} />
        </button>
      )}
    </div>
  );
}
