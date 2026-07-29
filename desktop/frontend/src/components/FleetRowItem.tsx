import { memo, useEffect, useRef } from "react";
import { AGENT_STATE_LABEL, type AgentState } from "../agentStatus";
import type { FleetRow } from "../fleetRows";
import { FleetElapsed } from "./FleetElapsed";
import { FleetTags } from "./FleetTags";
import { ClockIcon, TerminalIcon, XIcon } from "./icons";

const STATE_STYLE: Record<
  AgentState,
  { dot: string; text: string; motion?: string }
> = {
  "needs-you": {
    dot: "bg-[var(--accent-amber)]",
    text: "text-[var(--accent-amber-text)]",
    motion: "sidebar-waiting",
  },
  error: { dot: "bg-[var(--accent-red)]", text: "text-red-400" },
  working: {
    dot: "bg-[var(--accent-cyan)]",
    text: "text-[var(--accent-cyan-text)]",
    motion: "sidebar-shimmer",
  },
  done: { dot: "bg-[var(--accent-blue)]", text: "text-[var(--accent-blue)]" },
  idle: { dot: "bg-[var(--text-muted)]", text: "text-[var(--text-muted)]" },
};

/** A row id is a DOM id too (aria-activedescendant), so it has to be tame. */
export function fleetRowDomId(rowId: string): string {
  return `fleet-row-${rowId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export interface FleetRowItemProps {
  row: FleetRow;
  selected: boolean;
  reducedMotion: boolean;
  /** The section header already carries the project's name and badges. */
  hideProject?: boolean;
  onOpen: (row: FleetRow) => void;
  /** Always called: a row that can't be dismissed answers with a reason. */
  onDismiss: (row: FleetRow) => void;
}

export const FleetRowItem = memo(function FleetRowItem({
  row,
  selected,
  reducedMotion,
  hideProject = false,
  onOpen,
  onDismiss,
}: FleetRowItemProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const style = STATE_STYLE[row.state];
  const stateClass = reducedMotion ? style.text : style.motion ?? style.text;
  const animate = row.state === "working" && !reducedMotion;

  const named = row.project.name !== "" && !hideProject;
  const primary = named ? row.project.label : row.tabTitle ?? row.title;
  const secondary = [
    named || row.tabTitle ? row.title : null,
    row.detail,
  ].filter((part): part is string => part !== null);
  // Screen readers get the project even when the header is the one showing it.
  const spokenName = row.project.name ? row.project.label : row.title;

  return (
    <div
      ref={ref}
      id={fleetRowDomId(row.id)}
      role="option"
      aria-selected={selected}
      className={`group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors ${
        selected
          ? "bg-[var(--bg-active)] ring-1 ring-inset ring-[var(--accent-blue)]"
          : "hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--bg-hover)] ${
          animate ? "sidebar-shimmer-icon" : "text-[var(--text-muted)]"
        }`}
      >
        {row.kind === "automation" ? <ClockIcon size={15} /> : <TerminalIcon />}
      </span>

      <button
        type="button"
        onClick={() => onOpen(row)}
        className="min-w-0 flex-1 text-left focus-visible:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]">
            {primary}
          </span>
          {named && <FleetTags project={row.project} />}
          {named && row.tabTitle && (
            <span className="min-w-0 truncate text-[12px] text-[var(--text-muted)]">
              {row.tabTitle}
            </span>
          )}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot} ${
              animate ? "animate-pulse" : ""
            }`}
          />
          <span className={`shrink-0 ${stateClass}`}>
            {AGENT_STATE_LABEL[row.state]}
          </span>
          {secondary.length > 0 && (
            <span className="min-w-0 truncate">· {secondary.join(" · ")}</span>
          )}
        </span>
      </button>

      <FleetElapsed row={row} />

      <button
        type="button"
        onClick={() => onDismiss(row)}
        aria-label={
          row.dismissable
            ? `Clear ${AGENT_STATE_LABEL[row.state]} on ${spokenName}`
            : `Why ${spokenName} can't be cleared from here`
        }
        title={
          row.dismissable ? "Clear this row" : "Why this row stays until it's done"
        }
        className={`shrink-0 rounded-md p-1.5 text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100 ${
          selected ? "opacity-100" : "opacity-0"
        }`}
      >
        <XIcon />
      </button>
    </div>
  );
});
