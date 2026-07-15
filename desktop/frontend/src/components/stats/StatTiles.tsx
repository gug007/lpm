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

const caption = "mt-2 text-[11px] text-[var(--text-muted)]";

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
    <div className="grid grid-cols-4 gap-3">
      <StatTile
        label="Total tokens"
        value={formatTokenCount(totals.totalTokens)}
        aside={
          cost > 0 ? (
            <span
              title="Estimated at current public list prices, per model — cached reads and writes priced separately. OpenAI/Codex pricing is approximate."
              className="shrink-0 text-sm font-medium tabular-nums text-[var(--text-secondary)]"
            >
              ≈ {formatUsd(cost)}
            </span>
          ) : undefined
        }
      >
        {!singleDay && daily.length > 0 && (
          <div className="mt-2">
            <Sparkline data={daily.map((day) => day.totalTokens)} />
          </div>
        )}
        {singleDay ? (
          <div className={caption}>so far today</div>
        ) : peak ? (
          <div className={caption}>
            peak {formatTokenCount(peak.totalTokens)} · {shortUsageDate(peak.date)}
          </div>
        ) : null}
      </StatTile>

      <StatTile label="Input" value={formatTokenCount(totals.inputTokens)}>
        {cache > 0 && (
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-active)]">
            <div
              className="h-full rounded-full bg-[var(--accent-blue)]"
              style={{ width: `${Math.min(100, cache * 100)}%` }}
            />
          </div>
        )}
        <div className={caption}>{cache > 0 ? `${formatPercent(cache)} from cache` : "no cache"}</div>
      </StatTile>

      <StatTile label="Output" value={formatTokenCount(totals.outputTokens)}>
        <div className={caption}>
          {reasoning > 0 ? `${formatPercent(reasoning)} reasoning` : "no reasoning tokens"}
        </div>
      </StatTile>

      <StatTile label="Sessions" value={sessions.toLocaleString()}>
        <div className={caption}>
          {projectCount} project{projectCount === 1 ? "" : "s"} · {modelCount} model
          {modelCount === 1 ? "" : "s"}
        </div>
      </StatTile>
    </div>
  );
}
