import { AGENT_STATE_LABEL, AGENT_STATE_TONE } from "../agentStatus";
import { formatDuration } from "../jobsFormat";
import { useSecondsClock } from "../hooks/useSecondsClock";
import type { PaneAgentStatus } from "../hooks/usePaneStatus";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

// The dot carries the same animation as the text (AGENT_STATE_TONE) but cannot
// share the class: the text span paints its gradient through
// `-webkit-text-fill-color: transparent`, which a nested dot would inherit, so
// the dot sits outside it and fills from `currentColor` instead.
const DOT: Record<PaneAgentStatus["state"], string> = {
  working: "sidebar-shimmer-icon bg-current",
  "needs-you": "sidebar-waiting bg-current",
  error: "bg-[var(--accent-red)]",
  done: "bg-[var(--accent-blue)]",
};

/** "● Working  2m 30s" — what the agent in a terminal is doing, and how long it
 *  has been doing it. Ticks off the shared seconds clock, so only this label
 *  re-renders.
 *
 *  `compact` is the reading alone, in the composer placeholder's muted color at
 *  the size given: a button row in a narrow pane has no room for the word or
 *  the dot, and a number that changes every second draws the eye without any
 *  help from color. The state stays one hover away. */
export function AgentStatusChip({
  status,
  className = "",
  mutedClassName = "text-[var(--composer-fg-muted)]",
  compact = false,
  fontSize,
}: {
  status: PaneAgentStatus;
  className?: string;
  mutedClassName?: string;
  compact?: boolean;
  // Compact only, and the composer's input size — the reading reads as part of
  // the field it sits under, so it scales with the terminal font like the
  // placeholder does.
  fontSize?: number;
}) {
  const frozen = status.until !== undefined;
  const now = useSecondsClock(frozen);
  const dot = DOT[status.state];
  const label = AGENT_STATE_LABEL[status.state];
  const elapsed =
    status.since === null
      ? null
      : formatDuration(Math.max(0, (status.until ?? now) - status.since) / 1000);

  if (compact) {
    if (elapsed === null) return null;
    const tip = frozen ? `${label} — took ${elapsed}` : `${label} for ${elapsed}`;
    return (
      <Tooltip content={tip} delay={COMPOSER_TOOLTIP_DELAY_MS}>
        <span
          style={{ fontSize }}
          className={`shrink-0 whitespace-nowrap tabular-nums text-[var(--composer-fg-muted)] ${className}`}
        >
          {elapsed}
        </span>
      </Tooltip>
    );
  }

  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 text-[11px] font-medium ${className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className={`truncate ${AGENT_STATE_TONE[status.state]}`}>{label}</span>
      {elapsed !== null && (
        <span className={`shrink-0 tabular-nums ${mutedClassName}`}>
          {frozen ? `took ${elapsed}` : elapsed}
        </span>
      )}
    </span>
  );
}
