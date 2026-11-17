import { useMemo } from "react";
import type { DailyUsage, PreviousUsage, TokenUsage, UsageBreakdown } from "../../types";
import { formatPercent, formatTokenCount, shortUsageDate } from "../../agentUsageFormat";
import { cacheShare, mostActiveDay, reasoningShare } from "./statsDerive";
import { estimateTotalCost, formatUsd } from "./statsCost";
import { ChangeValue } from "./ChangeValue";
import { StatTile } from "./StatTile";
import { bucketDays, defaultGrain } from "./chartBuckets";

interface StatTilesProps {
  totals: TokenUsage;
  sessions: number;
  daily: DailyUsage[];
  models: UsageBreakdown[];
  projectCount: number;
  modelCount: number;
  days: number;
  /** The caption of a single day's tiles; "so far today" by default. */
  singleDayCaption?: string;
  /** The period before, when the tiles show the whole period. */
  previous?: PreviousUsage;
  changeLabel?: string;
}

const sumModels = (day: DailyUsage, pick: (tokens: TokenUsage) => number) =>
  day.models.reduce((sum, model) => sum + pick(model.tokens), 0);

function changeOf(now: number, before: number | undefined): number | "new" | null {
  if (before === undefined) return null;
  return before > 0 ? now / before - 1 : now > 0 ? "new" : null;
}

export function StatTiles({
  totals,
  sessions,
  daily,
  models,
  projectCount,
  modelCount,
  days,
  singleDayCaption = "so far today",
  previous,
  changeLabel,
}: StatTilesProps) {
  const peak = mostActiveDay(daily);
  const cache = cacheShare(totals);
  const reasoning = reasoningShare(totals);
  const cost = estimateTotalCost(models);
  const singleDay = days === 1;
  // A long period draws a bar per week, as the Projects trend does, rather
  // than hundreds of hairline days per tile.
  const buckets = useMemo(
    () => (singleDay ? null : bucketDays(daily, defaultGrain(daily.length))),
    [daily, singleDay],
  );
  const series = (pick: (day: DailyUsage) => number) => buckets?.map(pick);
  const perDaySessions = daily.some((day) => day.projects !== undefined);
  const change = (now: number, before: number | undefined) =>
    previous ? <ChangeValue change={changeOf(now, before)} title={changeLabel} /> : undefined;

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatTile
        label="Total tokens"
        value={formatTokenCount(totals.totalTokens)}
        change={change(totals.totalTokens, previous?.totals.totalTokens)}
        aside={
          cost > 0 ? (
            <span
              title="Estimated at current public list prices, per model — cached reads and writes priced separately. OpenAI/Codex pricing is approximate."
              className="flex shrink-0 cursor-help flex-col items-end text-sm font-medium leading-tight tabular-nums text-[var(--text-secondary)]"
            >
              <span>
                <span className="text-[var(--text-muted)]">≈</span> {formatUsd(cost)}
              </span>
              <span className="text-[11px] font-normal text-[var(--text-muted)]">at API prices</span>
            </span>
          ) : undefined
        }
        series={series((day) => day.totalTokens)}
        caption={
          singleDay
            ? singleDayCaption
            : peak
              ? `Peak ${formatTokenCount(peak.totalTokens)} on ${shortUsageDate(peak.date)}`
              : "No usage yet"
        }
      />

      <StatTile
        label="Input"
        value={formatTokenCount(totals.inputTokens)}
        change={change(totals.inputTokens, previous?.totals.inputTokens)}
        series={series((day) => sumModels(day, (tokens) => tokens.inputTokens))}
        caption={cache > 0 ? `${formatPercent(cache)} read from cache` : "Nothing read from cache"}
      />

      <StatTile
        label="Output"
        value={formatTokenCount(totals.outputTokens)}
        change={change(totals.outputTokens, previous?.totals.outputTokens)}
        series={series((day) => sumModels(day, (tokens) => tokens.outputTokens))}
        caption={reasoning > 0 ? `${formatPercent(reasoning)} spent reasoning` : "No reasoning tokens"}
      />

      <StatTile
        label="Sessions"
        value={sessions.toLocaleString()}
        change={change(sessions, previous?.sessions)}
        series={
          perDaySessions
            ? series((day) => (day.projects ?? []).reduce((sum, row) => sum + row.started, 0))
            : undefined
        }
        caption={`Across ${projectCount} project${projectCount === 1 ? "" : "s"} · ${modelCount} model${
          modelCount === 1 ? "" : "s"
        }`}
      />
    </div>
  );
}
