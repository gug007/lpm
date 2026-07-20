import type { LimitWindow } from "../hooks/useAgentLimits";
import {
  barColor,
  computePace,
  durationShort,
  paceLabel,
  resetAbsolute,
  resetText,
} from "./stats/limitsFormat";
import { usePrefersReducedMotion } from "./stats/usePrefersReducedMotion";

interface UsageMeterProps {
  label: string;
  win: LimitWindow | undefined;
  windowMs: number;
  now: number;
  stale: boolean;
}

function verdictColor(verdict: string | undefined): string {
  if (verdict === "exhausted") return "text-[var(--accent-red-text)]";
  if (verdict === "over") return "text-[var(--accent-amber-text)]";
  return "text-[var(--text-muted)]";
}

export function UsageMeter({ label, win, windowMs, now, stale }: UsageMeterProps) {
  const reducedMotion = usePrefersReducedMotion();
  const pace = computePace(win, windowMs, now);
  const expired = pace?.expired ?? false;
  // Past its reset the last reading describes a window that no longer exists, so
  // it is shown as absent rather than as a number the user might still act on.
  const hasData = !!win && !expired;

  const raw = win && Number.isFinite(win.usedPercent) ? win.usedPercent : 0;
  const barPct = Math.max(0, Math.min(100, raw));
  const shown = Math.round(Math.max(0, raw));

  const verdict = expired ? "window reset · awaiting new data" : paceLabel(pace);
  const resetLine =
    hasData && win.resetsAt > 0
      ? `${resetText(win.resetsAt, now)} · ${resetAbsolute(win.resetsAt)}`
      : "";
  const runsOut =
    hasData && pace?.verdict === "over" && pace.exhaustsInMs != null
      ? `runs out in ~${durationShort(pace.exhaustsInMs)}, before reset`
      : "";
  const showTick = hasData && !!pace && pace.verdict !== "early" && pace.verdict !== "unknown";
  const elapsed = pace ? Math.round(pace.elapsedPercent) : 0;

  const valueText = hasData
    ? [
        `${shown}% used`,
        verdict,
        showTick ? `${elapsed}% of the window elapsed` : "",
        resetText(win.resetsAt, now),
        runsOut,
      ]
        .filter(Boolean)
        .join(", ")
    : expired
      ? "window reset, awaiting new data"
      : "no data yet";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--text-muted)]">
        {label}
      </span>

      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span
          className={`text-2xl font-semibold leading-none tracking-tight tabular-nums ${
            hasData && !stale ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
          }`}
        >
          {hasData ? shown : "—"}
        </span>
        {hasData && <span className="text-sm leading-none text-[var(--text-muted)]">%</span>}
        {verdict && (
          <span
            className={`text-[11px] leading-none ${
              expired ? "text-[var(--text-muted)]" : verdictColor(pace?.verdict)
            }`}
          >
            {verdict}
          </span>
        )}
      </div>

      <div
        role="meter"
        aria-label={`${label} window usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasData ? Math.min(100, shown) : 0}
        aria-valuetext={valueText}
        title={showTick ? `${elapsed}% of the window has elapsed` : undefined}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-active)]"
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${hasData ? barPct : 0}%`,
            backgroundColor: barColor(barPct),
            opacity: stale ? 0.4 : 1,
            transition: reducedMotion ? "none" : "width 700ms ease-out",
          }}
        />
        {showTick && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 w-px -translate-x-1/2 bg-[var(--text-secondary)] opacity-70"
            style={{ left: `${pace.elapsedPercent}%` }}
          />
        )}
      </div>

      <div className="flex min-h-[14px] flex-col gap-0.5">
        <span className="truncate text-[11px] tabular-nums text-[var(--text-muted)]">
          {resetLine}
        </span>
        {runsOut && (
          <span className="truncate text-[11px] tabular-nums text-[var(--accent-amber-text)]">
            {runsOut}
          </span>
        )}
      </div>
    </div>
  );
}
