import { visibleDay, type DayPoint } from "./stats-derive";
import { dayLabel, formatPercent, formatTokenCount, formatUsd } from "./stats-format";
import { PROVIDERS, PROVIDER_META, type Provider } from "./stats-sample-data";

const WIDTH_PX = 240;
const OFFSET_PX = 8;
const FLIP_AT = 0.62;

export default function StatsChartTooltip({
  day,
  hidden,
  center,
  now,
  inline = false,
}: {
  inline?: boolean;
  day: DayPoint;
  hidden: ReadonlySet<Provider>;
  center: number;
  now: number | null;
}) {
  const visible = visibleDay(day, hidden);
  const anchor =
    center > FLIP_AT
      ? `${center * 100}% - ${WIDTH_PX + OFFSET_PX}px`
      : `${center * 100}% + ${OFFSET_PX}px`;

  return (
    <div
      aria-hidden
      className={inline ? "relative w-full" : "pointer-events-none absolute top-2 z-10 w-60 max-w-full"}
      style={inline ? undefined : { left: `clamp(0px, calc(${anchor}), calc(100% - ${WIDTH_PX}px))` }}
    >
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 shadow-lg shadow-black/40">
        <p className="text-xs font-semibold text-[var(--text-primary)]">{dayLabel(day.ago, now)}</p>
        <div className="mt-1.5 space-y-1">
          {PROVIDERS.filter((provider) => !hidden.has(provider)).map((provider) => {
            const meta = PROVIDER_META[provider];
            const tokens = visible[provider];
            return (
              <div key={provider} className="flex items-center gap-2 text-[11px]">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="text-[var(--text-secondary)]">{meta.short}</span>
                <span className="ml-auto tabular-nums text-[var(--text-primary)]">
                  {formatTokenCount(tokens)}
                </span>
                <span className="w-14 text-right tabular-nums text-[var(--text-secondary)]">
                  {formatUsd(day.cost[provider])}
                </span>
                <span className="w-9 text-right tabular-nums text-[var(--text-muted)]">
                  {formatPercent(tokens / Math.max(1, visible.total))}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex items-center gap-2 border-t border-[var(--border)] pt-1.5 text-[11px]">
          <span className="text-[var(--text-muted)]">Total</span>
          <span className="ml-auto tabular-nums text-[var(--text-primary)]">
            {formatTokenCount(visible.total)}
          </span>
          <span className="w-14 text-right tabular-nums text-[var(--text-primary)]">
            {`≈ ${formatUsd(visible.cost)}`}
          </span>
          <span className="w-9" />
        </div>
      </div>
    </div>
  );
}
