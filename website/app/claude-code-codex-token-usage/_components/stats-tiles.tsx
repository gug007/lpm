import { dayTotal, type PeriodStats } from "./stats-derive";
import {
  dayLabel,
  formatCount,
  formatPercent,
  formatTokenCount,
  formatUsd,
  plural,
} from "./stats-format";
import StatsSparkline from "./stats-sparkline";
import StatsTile from "./stats-tile";

const COST_TITLE =
  "Estimated at API list prices built into lpm, per model, with cached reads and writes priced separately. Codex pricing is approximate.";


export default function StatsTiles({
  stats,
  singleDay,
  now,
}: {
  stats: PeriodStats;
  singleDay: boolean;
  now: number | null;
}) {
  const { totals, peak } = stats;
  const cache = totals.cached / Math.max(1, totals.input);
  const reasoning = totals.reasoning / Math.max(1, totals.output);

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <StatsTile
        label="Total tokens"
        value={formatTokenCount(totals.total)}
        extra={
          stats.cost > 0 && (
            <span
              title={COST_TITLE}
              className="shrink-0 text-sm font-medium tabular-nums text-[var(--text-secondary)]"
            >
              {`≈ ${formatUsd(stats.cost)}`}
            </span>
          )
        }
        caption={
          singleDay
            ? "so far today"
            : peak && `peak ${formatTokenCount(dayTotal(peak))} · ${dayLabel(peak.ago, now)}`
        }
      >
        {!singleDay && <StatsSparkline data={stats.days.map(dayTotal)} />}
      </StatsTile>

      <StatsTile
        label="Input"
        value={formatTokenCount(totals.input)}
        caption={cache > 0 ? `${formatPercent(cache)} from cache` : "no cache"}
      >
        {cache > 0 && (
          <div aria-hidden className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-active)]">
            <div
              className="h-full rounded-full bg-[var(--accent-blue)]"
              style={{ width: `${Math.min(100, cache * 100)}%` }}
            />
          </div>
        )}
      </StatsTile>

      <StatsTile
        label="Output"
        value={formatTokenCount(totals.output)}
        caption={reasoning > 0 ? `${formatPercent(reasoning)} reasoning` : "no reasoning tokens"}
      />

      <StatsTile
        label="Sessions"
        value={formatCount(stats.sessionCount)}
        caption={`${plural(stats.projects.length, "project")} · ${plural(stats.modelCount, "model")}`}
      />
    </div>
  );
}
