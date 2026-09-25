import {
  barColor,
  meterValueText,
  paceLabel,
  runsOutText,
  showsTick,
  verdictTone,
  type Pace,
} from "./pace-model";

export default function PaceMeter({
  label,
  used,
  pace,
  resetLine,
}: {
  label: string;
  used: number;
  pace: Pace;
  resetLine: string;
}) {
  const shown = Math.round(Math.max(0, used));
  const barPct = Math.max(0, Math.min(100, used));
  const verdict = paceLabel(pace.verdict);
  const runsOut = runsOutText(pace);
  const tick = showsTick(pace);
  const elapsed = Math.round(pace.elapsedPercent);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--text-muted)]">
        {label}
      </span>

      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums text-[var(--text-primary)]">
          {shown}
        </span>
        <span className="text-sm leading-none text-[var(--text-muted)]">%</span>
        {verdict && (
          <span className={`text-[11px] leading-none ${verdictTone(pace.verdict)}`}>
            {verdict}
          </span>
        )}
      </div>

      <div className="relative">
        <div
          role="meter"
          aria-label={`${label} window usage`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, shown)}
          aria-valuetext={meterValueText(used, pace)}
          title={tick ? `${elapsed}% of the window has elapsed` : undefined}
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-active)]"
        >
          <div
            className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
            style={{ width: `${barPct}%`, backgroundColor: barColor(barPct) }}
          />
        </div>
        {tick && (
          <div
            aria-hidden
            className="absolute -top-[3px] h-3 w-0.5 -translate-x-1/2 rounded-full bg-[var(--text-primary)] shadow-[0_0_0_1px_var(--bg-primary)]"
            style={{ left: `${pace.elapsedPercent}%` }}
          />
        )}
      </div>

      <div className="flex min-h-[14px] flex-col gap-0.5 text-[11px] tabular-nums">
        <span className="text-[var(--text-muted)]">{resetLine}</span>
        {runsOut && <span className="text-[var(--accent-amber)]">{runsOut}</span>}
      </div>
    </div>
  );
}
