import { CalendarClock, Gauge } from "lucide-react";
import ResetTimeline from "./reset-timeline";
import type { Flag, Pick, Scenario } from "./reset-data";

const FOOTER_BUTTON =
  "flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border)] px-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent";

type Props = {
  scenario: Scenario;
  pick: Pick;
  canEarlier: boolean;
  canLater: boolean;
  onFlag: (flag: Flag) => void;
  onNudge: (dir: 1 | -1) => void;
  onLimit: () => void;
  onCommit: () => void;
};

export default function ResetPicker({
  scenario,
  pick,
  canEarlier,
  canLater,
  onFlag,
  onNudge,
  onLimit,
  onCommit,
}: Props) {
  const later = scenario.footerLimit;

  return (
    <div
      role="group"
      aria-label="Send later"
      className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3.5 pb-3 pt-3 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55)]"
    >
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <p className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[16px] font-medium text-[var(--text-primary)]">Today</span>
            <span className="text-[16px] font-medium tabular-nums text-[var(--text-primary)]">
              {pick.time}
            </span>
            <span className="text-[12px] tabular-nums text-[var(--accent-blue)]">{`· ${pick.countdown}`}</span>
          </p>
          <p className="pt-1 text-[10.5px] leading-snug text-[var(--text-muted)] sm:text-right">
            Click a flag to schedule, or step with −&nbsp;30m and +&nbsp;30m
          </p>
        </div>
      </div>

      <ResetTimeline flags={scenario.flags} dotX={pick.x} onFlag={onFlag} />

      <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-2.5">
        <button
          type="button"
          data-focus="earlier"
          onClick={() => onNudge(-1)}
          disabled={!canEarlier}
          className={FOOTER_BUTTON}
        >
          − 30m
        </button>
        <button
          type="button"
          data-focus="later"
          onClick={() => onNudge(1)}
          disabled={!canLater}
          className={FOOTER_BUTTON}
        >
          + 30m
        </button>
        <button type="button" disabled title="Not in this demo" className={FOOTER_BUTTON}>
          <CalendarClock aria-hidden size={12} strokeWidth={1.75} />
          Another day or time…
        </button>
        {later && (
          <button type="button" onClick={onLimit} title={later.title} className={FOOTER_BUTTON}>
            <Gauge aria-hidden size={12} strokeWidth={1.75} />
            {later.label}
          </button>
        )}
        <div className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={onCommit}
          className="ml-auto flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-blue)] px-3 text-[12px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 max-sm:w-full"
        >
          {`Schedule for ${pick.time}`}
          <span aria-hidden className="text-[11px] opacity-70">
            ↵
          </span>
        </button>
      </div>
    </div>
  );
}
