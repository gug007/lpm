import type { DailyUsage, TokenUsage, UsageBreakdown } from "../../types";
import { formatPercent, formatTokenCount, shortUsageDate } from "../../agentUsageFormat";
import { cacheShare, mostActiveDay, reasoningShare } from "./statsDerive";
import { estimateTotalCost, formatUsd } from "./statsCost";
import { StatTile } from "./StatTile";
import { Sparkline } from "./Sparkline";

interface StatTilesProps {
  totals: TokenUsage;
  sessions: number;
  daily: DailyUsage[];
  models: UsageBreakdown[];
  projectCount: number;
  modelCount: number;
  days: number;
}

export function StatTiles({
  totals,
  sessions,
  daily,
  models,
  projectCount,
  modelCount,
  days,
}: StatTilesProps) {
  const peak = mostActiveDay(daily);
  const cache = cacheShare(totals);
  const reasoning = reasoningShare(totals);
  const cost = estimateTotalCost(models);
  const singleDay = days === 1;

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatTile
        label="Total tokens"
        value={formatTokenCount(totals.totalTokens)}
        aside={
          cost > 0 ? (
            <span
              title="Estimated at current public list prices, per model — cached reads and writes priced separately. OpenAI/Codex pricing is approximate."
              className="shrink-0 text-sm font-medium tabular-nums text-[var(--text-secondary)]"
            >
              <span className="text-[var(--text-muted)]">≈</span> {formatUsd(cost)}
            </span>
          ) : undefined
        }
        caption={
          singleDay
            ? "so far today"
            : peak
              ? `peak ${formatTokenCount(peak.totalTokens)} · ${shortUsageDate(peak.date)}`
              : undefined
        }
      >
        {!singleDay && daily.length > 0 && (
          <div className="mt-2">
            <Sparkline data={daily.map((day) => day.totalTokens)} />
          </div>
        )}
      </StatTile>

      <StatTile
        label="Input"
        value={formatTokenCount(totals.inputTokens)}
        caption={cache > 0 ? `${formatPercent(cache)} from cache` : "no cache"}
      >
        {cache > 0 && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-active)]">
            <div
              className="h-full rounded-full bg-[var(--accent-blue)]"
              style={{ width: `${Math.min(100, cache * 100)}%` }}
            />
          </div>
        )}
      </StatTile>

      <StatTile
        label="Output"
        value={formatTokenCount(totals.outputTokens)}
        caption={reasoning > 0 ? `${formatPercent(reasoning)} reasoning` : "no reasoning tokens"}
      />

      <StatTile
        label="Sessions"
        value={sessions.toLocaleString()}
        caption={`${projectCount} project${projectCount === 1 ? "" : "s"} · ${modelCount} model${
          modelCount === 1 ? "" : "s"
        }`}
      />
    </div>
  );
}
