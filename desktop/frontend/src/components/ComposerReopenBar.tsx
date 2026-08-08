import { composerPlaceholder } from "../composerText";
import { useComposerStore } from "../store/composer";
import { MessageIcon } from "./icons";
import { AgentStatusChip } from "./AgentStatusChip";
import type { PaneAgentStatus } from "../hooks/usePaneStatus";

interface ComposerReopenBarProps {
  // Terminal the input would target; drives the same placeholder as the live
  // input so the collapsed bar stands in for the same field.
  targetLabel: string;
  // Terminal font size; the label scales with it just like the composer's real
  // placeholder, so toggling open doesn't jump the text size.
  fontSize: number;
  // Closing the input must not also hide what the agent is doing, so the
  // stand-in carries the same status readout the live composer shows.
  agentStatus?: PaneAgentStatus | null;
}

// Shown in the composer's slot when the shared input is closed: a slim, inert
// stand-in for the field that reopens it on click (same as ⌘I). Sits per-pane so
// wherever a terminal is, its input is one click away.
export function ComposerReopenBar({ targetLabel, fontSize, agentStatus }: ComposerReopenBarProps) {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--terminal-bg)] px-3 py-1.5">
      <button
        type="button"
        onClick={() => useComposerStore.getState().setOpen(true)}
        title="Show input (⌘I)"
        aria-label={`Show message input for ${targetLabel}`}
        className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-left text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <span className="flex shrink-0 items-center">
          <MessageIcon />
        </span>
        <span
          style={{ fontSize, lineHeight: 1.5 }}
          className="min-w-0 flex-1 truncate"
        >
          {composerPlaceholder(targetLabel)}
        </span>
        {/* The collapsed bar is full width and its placeholder truncates first,
            so there is room for the state word the button row has to drop. */}
        {agentStatus && (
          <AgentStatusChip
            status={agentStatus}
            className="shrink-0"
            mutedClassName="text-[var(--text-muted)]"
          />
        )}
        <span className="shrink-0 font-mono text-[11px]">⌘I</span>
      </button>
    </div>
  );
}
