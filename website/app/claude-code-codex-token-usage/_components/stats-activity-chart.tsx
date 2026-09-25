"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { useInView } from "@/components/config/playground/hooks";
import StatsChartBar from "./stats-chart-bar";
import StatsChartTable from "./stats-chart-table";
import StatsChartTooltip from "./stats-chart-tooltip";
import {
  CHART_MODES,
  barMaxWidth,
  describeDay,
  nearestIndex,
  niceMax,
  niceTicks,
  stackFractions,
  type ChartMode,
} from "./stats-chart-scale";
import { visibleDay, type DayPoint } from "./stats-derive";
import { dayLabel } from "./stats-format";
import StatsProviderChips from "./stats-provider-chips";
import { type Period, type Provider } from "./stats-sample-data";
import StatsSegmented from "./stats-segmented";
import { trackOnce } from "./track-once";

const PLOT_LABEL =
  "Token activity by day. Use the left and right arrow keys to read each day, Escape to clear.";

const TABLE_CAPTION: Record<Period, string> = {
  1: "Token usage today",
  7: "Daily token usage, last 7 days",
  30: "Daily token usage, last 30 days",
  0: "Daily token usage, last 28 active days",
};

export default function StatsActivityChart({
  days,
  period,
  hidden,
  mode,
  now,
  onToggleProvider,
  onMode,
}: {
  days: DayPoint[];
  period: Period;
  hidden: ReadonlySet<Provider>;
  mode: ChartMode;
  now: number | null;
  onToggleProvider: (provider: Provider) => void;
  onMode: (mode: ChartMode) => void;
}) {
  const { ref: plotRef, inView } = useInView<HTMLDivElement>("0px 0px -15% 0px");
  const [cursor, setCursor] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const count = days.length;
  const visible = days.map((day) => visibleDay(day, hidden));
  const maxValue = niceMax(Math.max(0, ...visible.map((day) => day.total)));
  const ticks = niceTicks(maxValue, mode);
  const single = count === 1;
  const collapsed = now !== null && !inView;
  const active = cursor !== null && cursor < count ? cursor : null;
  const center = active !== null ? (active + 0.5) / count : 0;

  const select = (index: number | null) => {
    setCursor(index);
    if (index !== null) trackOnce("stats-chart");
  };

  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return nearestIndex(event.clientX, rect.left, rect.width, count);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    let next: number | null;
    if (event.key === "ArrowRight") next = Math.min(count - 1, (active ?? -1) + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, (active ?? count) - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else if (event.key === "Escape" && active !== null) next = null;
    else return;
    event.preventDefault();
    select(next);
    setAnnouncement(next === null ? "Selection cleared." : describeDay(days[next], hidden, now));
  };

  return (
    <div className="relative flex min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3 sm:p-4 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">Token activity</p>
          <StatsProviderChips hidden={hidden} onToggle={onToggleProvider} />
        </div>
        <StatsSegmented label="Chart mode" options={CHART_MODES} value={mode} onChange={onMode} />
      </div>

      <div className="mt-4 flex h-40 gap-2 lg:h-auto lg:min-h-40 lg:flex-1">
        <div aria-hidden className="relative w-9 shrink-0">
          {ticks.map((tick) => (
            <span
              key={tick.frac}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-[var(--text-muted)]"
              style={{ top: `${(1 - tick.frac) * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div
          ref={plotRef}
          tabIndex={0}
          role="group"
          aria-label={PLOT_LABEL}
          onKeyDown={onKeyDown}
          onPointerMove={(event) => {
            if (event.pointerType !== "touch" && count > 0) select(indexAt(event));
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") setCursor(null);
          }}
          onBlur={() => setCursor(null)}
          onPointerDown={(event) => {
            if (event.pointerType !== "touch" || count === 0) return;
            const index = indexAt(event);
            select(index === active ? null : index);
          }}
          className="relative min-w-0 flex-1 rounded-md"
        >
          {ticks.map((tick) => (
            <div
              key={tick.frac}
              aria-hidden
              className={`absolute inset-x-0 border-t ${
                tick.frac === 0 ? "border-[var(--border)]" : "border-[var(--border)]/50"
              }`}
              style={{ top: `${(1 - tick.frac) * 100}%` }}
            />
          ))}

          {active !== null && (
            <div
              aria-hidden
              className="absolute inset-y-0 bg-[var(--bg-hover)]"
              style={{ left: `${(active / count) * 100}%`, width: `${100 / count}%` }}
            />
          )}

          <div aria-hidden className="absolute inset-0 flex items-end overflow-hidden">
            {visible.map((day, index) => {
              const stack = stackFractions(day.claude, day.codex, mode, maxValue);
              return (
                <StatsChartBar
                  key={days[index].ago}
                  claude={stack.claude}
                  codex={stack.codex}
                  index={index}
                  maxWidth={barMaxWidth(count)}
                  collapsed={collapsed}
                  dimmed={active !== null && active !== index}
                />
              );
            })}
          </div>

          {active !== null && (
            <>
              <div
                aria-hidden
                className="absolute inset-y-0 w-px bg-[var(--text-muted)]"
                style={{ left: `${center * 100}%` }}
              />
              <div className="max-sm:hidden">
                <StatsChartTooltip day={days[active]} hidden={hidden} center={center} now={now} />
              </div>
            </>
          )}
        </div>
      </div>

      <div aria-hidden className="mt-1.5 flex gap-2">
        <div className="w-9 shrink-0" />
        <div className="relative h-4 flex-1 text-[10px] text-[var(--text-muted)]">
          {count === 0 ? null : single ? (
            <span className="absolute left-1/2 -translate-x-1/2">{dayLabel(days[0].ago, now)}</span>
          ) : (
            <>
              <span className="absolute left-0">{dayLabel(days[0].ago, now)}</span>
              <span className="absolute left-1/2 -translate-x-1/2">
                {dayLabel(days[Math.floor((count - 1) / 2)].ago, now)}
              </span>
              <span className="absolute right-0">{dayLabel(days[count - 1].ago, now)}</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-2 min-h-[76px] sm:hidden">
        {active !== null ? (
          <StatsChartTooltip inline day={days[active]} hidden={hidden} center={center} now={now} />
        ) : (
          count > 0 && <p className="text-[11px] text-[var(--text-muted)]">Tap a bar for that day&apos;s totals</p>
        )}
      </div>

      {single && (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          Single day — pick a longer range for trends
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <StatsChartTable days={days} caption={TABLE_CAPTION[period]} now={now} />
    </div>
  );
}
