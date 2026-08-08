import { AGENT_STATE_LABEL } from "../agentStatus";
import { formatDuration } from "../jobsFormat";
import { useSecondsClock } from "../hooks/useSecondsClock";
import type { PaneAgentStatus } from "../hooks/usePaneStatus";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

// Text and dot carry the same animation as the tab label they mirror: a
// shimmering cycle while working, an amber pulse while the agent needs you. The
// dot sits outside the shimmer text span — that span paints its gradient
// through `-webkit-text-fill-color: transparent`, which a nested dot inherits.
const TONE: Record<PaneAgentStatus["state"], { text: string; dot: string }> = {
  working: { text: "sidebar-shimmer", dot: "sidebar-shimmer-icon bg-current" },
  "needs-you": { text: "sidebar-waiting", dot: "sidebar-waiting bg-current" },
  error: { text: "text-[var(--accent-red)]", dot: "bg-[var(--accent-red)]" },
  done: { text: "text-[var(--accent-blue)]", dot: "bg-[var(--accent-blue)]" },
};

// A number that changes every second is motion enough — the reading takes the
// state's color but never its animation, which would make it hard to read.
const STILL: Record<PaneAgentStatus["state"], string> = {
  working: "text-[var(--accent-blue)]",
  "needs-you": "text-[var(--accent-amber)]",
  error: "text-[var(--accent-red)]",
  done: "text-[var(--composer-fg-muted)]",
};

/** "● Working  2m 30s" — what the agent in a terminal is doing, and how long it
 *  has been doing it. Ticks off the shared seconds clock, so only this label
 *  re-renders.
 *
 *  `compact` is the reading alone, at button-row size, tinted by the state that
 *  the word and the dot would otherwise spell out — a button row in a narrow
 *  pane has no room for either, and the state stays one hover away. */
export function AgentStatusChip({
  status,
  className = "",
  mutedClassName = "text-[var(--composer-fg-muted)]",
  compact = false,
}: {
  status: PaneAgentStatus;
  className?: string;
  mutedClassName?: string;
  compact?: boolean;
}) {
  const frozen = status.until !== undefined;
  const now = useSecondsClock(frozen);
  const tone = TONE[status.state];
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
          className={`shrink-0 whitespace-nowrap text-[13px] font-medium tabular-nums ${STILL[status.state]} ${className}`}
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
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
      <span className={`truncate ${tone.text}`}>{label}</span>
      {elapsed !== null && (
        <span className={`shrink-0 tabular-nums ${mutedClassName}`}>
          {frozen ? `took ${elapsed}` : elapsed}
        </span>
      )}
    </span>
  );
}
