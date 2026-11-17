import { useEffect, useMemo, useRef, useState } from "react";
import { formatTokenCount } from "../../agentUsageFormat";
import { providerMeta } from "./statsDerive";
import {
  type ChartMode,
  type ProviderFilter,
  nearestIndex,
  niceMax,
  niceTicks,
  stackSegments,
} from "./chartScale";
import type { ChartBucket, Grain } from "./chartBuckets";
import { axisLabels, bucketLabel, peakIndex, peakLabel } from "./chartAxis";
import { isWeekend } from "./statsDates";
import type { DayRange } from "./statsScope";
import { ChartTooltip } from "./ChartTooltip";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const SHADE = "color-mix(in srgb, var(--text-primary) 5%, transparent)";
const PIN = "color-mix(in srgb, var(--accent-blue) 16%, transparent)";

const hatch = (color: string) =>
  `repeating-linear-gradient(135deg, ${color} 0 3px, color-mix(in srgb, ${color} 35%, transparent) 3px 6px)`;

function barWidthFor(count: number): number | undefined {
  if (count === 1) return 48;
  if (count <= 7) return 32;
  if (count <= 14) return 22;
  return count <= 31 ? 14 : undefined;
}

// Keeps a label inside the plot when its bar sits at an edge.
function edgeShift(fraction: number): string {
  if (fraction < 0.08) return "translateX(0)";
  if (fraction > 0.92) return "translateX(-100%)";
  return "translateX(-50%)";
}

interface ChartBarsProps {
  buckets: ChartBucket[];
  grain: Grain;
  mode: ChartMode;
  filter: ProviderFilter;
  pinned: DayRange | null;
  onPin: (range: DayRange, extend: boolean) => void;
}

export function ChartBars({ buckets, grain, mode, filter, pinned, onPin }: ChartBarsProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [cursor, setCursor] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(reducedMotion);
  const plotRef = useRef<HTMLDivElement>(null);
  const count = buckets.length;

  useEffect(() => {
    if (reducedMotion) {
      setDrawn(true);
      return;
    }
    setDrawn(false);
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  useEffect(() => setCursor(null), [count, grain]);

  const total = useMemo(
    () => buckets.reduce((sum, bucket) => sum + bucket.totalTokens, 0),
    [buckets],
  );
  const maxValue = useMemo(
    () => niceMax(Math.max(0, ...buckets.map((b) => b.totalTokens))),
    [buckets],
  );
  const ticks = useMemo(() => niceTicks(maxValue, mode), [maxValue, mode]);
  const labels = useMemo(() => axisLabels(buckets, grain), [buckets, grain]);
  const peak = useMemo(() => peakIndex(buckets), [buckets]);
  const pinnedIndexes = buckets.flatMap((bucket, index) =>
    pinned && bucket.end >= pinned.from && bucket.date <= pinned.to ? [index] : [],
  );
  const barWidth = barWidthFor(count);
  const gutter = count > 90 ? 0.5 : count > 45 ? 1 : 2;
  const trends = mode === "volume" && count > 1 && total > 0;
  const average = total / Math.max(1, count);
  const lastPartial = count > 1 && buckets[count - 1]?.partial;
  const weekends = grain === "day" && count > 1 && buckets.some((b) => isWeekend(b.date));

  const indexAt = (clientX: number) => {
    const element = plotRef.current;
    if (!element || count === 0) return null;
    const rect = element.getBoundingClientRect();
    return nearestIndex(clientX, rect.left, rect.width, count);
  };

  const pin = (index: number, extend: boolean) => {
    const bucket = buckets[index];
    if (bucket) onPin({ from: bucket.date, to: bucket.end }, extend);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setCursor((current) => Math.min(count - 1, (current ?? -1) + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setCursor((current) => Math.max(0, (current ?? count) - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pin(cursor ?? count - 1, event.shiftKey);
    } else if (event.key === "Escape") {
      setCursor(null);
    }
  };

  const active = cursor !== null ? buckets[cursor] : null;
  const centerFraction = cursor !== null ? (cursor + 0.5) / count : 0;
  const peakBucket = peak !== null ? buckets[peak] : null;
  const peakFraction = peak !== null ? (peak + 0.5) / count : 0;

  return (
    <>
      <div className="mt-4 flex min-h-[200px] flex-1 gap-2">
        <div className="relative w-11 shrink-0">
          {ticks.map((tick) => (
            <span
              key={tick.frac}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-[var(--text-muted)]"
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
          aria-label="Token usage over time. Arrow keys move, Enter focuses the page on a bar."
          onMouseMove={(event) => setCursor(indexAt(event.clientX))}
          onMouseLeave={() => setCursor(null)}
          onMouseDown={(event) => event.shiftKey && event.preventDefault()}
          onClick={(event) => {
            const index = indexAt(event.clientX);
            if (index !== null) pin(index, event.shiftKey);
          }}
          onKeyDown={onKeyDown}
          className="relative flex-1 cursor-pointer rounded-md outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]/50"
        >
          {ticks.map((tick) => (
            <div
              key={tick.frac}
              className={`absolute inset-x-0 border-t ${
                tick.frac === 0 ? "border-[var(--border)]" : "border-[var(--border)]/50"
              }`}
              style={{ top: `${(1 - tick.frac) * 100}%` }}
            />
          ))}

          {pinnedIndexes.length > 0 && (
            <div
              className="absolute inset-y-0 rounded-sm"
              style={{
                left: `${(pinnedIndexes[0] / count) * 100}%`,
                width: `${(pinnedIndexes.length / count) * 100}%`,
                backgroundColor: PIN,
              }}
            />
          )}

          {cursor !== null && (
            <div
              className="absolute inset-y-0 bg-[var(--bg-hover)]"
              style={{ left: `${(cursor / count) * 100}%`, width: `${100 / count}%` }}
            />
          )}

          <div className="absolute inset-0 flex items-end overflow-hidden">
            {buckets.map((bucket, index) => {
              const seg = stackSegments(bucket, mode, maxValue);
              const claude = Math.max(0, seg.claude * 100);
              const codex = Math.max(0, seg.codex * 100);
              const dimmed = pinned
                ? !pinnedIndexes.includes(index)
                : cursor !== null && cursor !== index;
              const claudeColor = providerMeta("claude").color;
              const codexColor = providerMeta("codex").color;
              return (
                <div
                  key={bucket.date}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                  style={{
                    paddingInline: gutter,
                    backgroundColor: weekends && isWeekend(bucket.date) ? SHADE : undefined,
                  }}
                >
                  <div
                    className="mx-auto flex h-full w-full flex-col justify-end"
                    style={{
                      maxWidth: barWidth,
                      opacity: dimmed ? (pinned ? 0.35 : 0.55) : 1,
                      transform: drawn ? "scaleY(1)" : "scaleY(0)",
                      transformOrigin: "bottom",
                      transition: reducedMotion
                        ? "none"
                        : `transform 240ms ease-out ${Math.min(index * 8, 240)}ms, opacity 120ms ease-out`,
                    }}
                  >
                    {claude === 0 && codex === 0 ? (
                      <div className="h-px w-full bg-[var(--border)]" />
                    ) : (
                      <>
                        {codex > 0 && (
                          <div
                            className="w-full shrink-0 rounded-t-[2px]"
                            style={{
                              height: `${codex}%`,
                              minHeight: 2,
                              background: bucket.partial ? hatch(codexColor) : codexColor,
                            }}
                          />
                        )}
                        {codex > 0 && claude > 0 && (
                          <div className="shrink-0" style={{ height: count > 90 ? 1 : 2 }} />
                        )}
                        {claude > 0 && (
                          <div
                            className={`w-full shrink-0 ${codex > 0 ? "" : "rounded-t-[2px]"}`}
                            style={{
                              height: `${claude}%`,
                              minHeight: 2,
                              background: bucket.partial ? hatch(claudeColor) : claudeColor,
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {trends && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--text-secondary)]/70"
              style={{ top: `${(1 - average / maxValue) * 100}%` }}
            />
          )}

          {trends && peakBucket && cursor === null && (
            <span
              className="pointer-events-none absolute whitespace-nowrap rounded bg-[var(--bg-active)] px-1.5 py-px text-[11px] font-medium tabular-nums text-[var(--text-primary)]"
              style={{
                left: `${peakFraction * 100}%`,
                top: `max(0px, calc(${(1 - peakBucket.totalTokens / maxValue) * 100}% - 20px))`,
                transform: edgeShift(peakFraction),
              }}
            >
              peak {formatTokenCount(peakBucket.totalTokens)} · {peakLabel(peakBucket, grain)}
            </span>
          )}

          {cursor !== null && (
            <div
              className="absolute inset-y-0 w-px bg-[var(--text-muted)]"
              style={{ left: `${centerFraction * 100}%` }}
            />
          )}

          {active && (
            <ChartTooltip
              bucket={active}
              title={`${bucketLabel(active, grain)}${active.partial ? " · so far" : ""}`}
              filter={filter}
              centerFraction={centerFraction}
              reducedMotion={reducedMotion}
            />
          )}
        </div>
      </div>

      <div className="mt-1.5 flex gap-2">
        <div className="w-11 shrink-0" />
        <div className="relative h-4 flex-1 text-[11px] text-[var(--text-muted)]">
          {labels.map((label) => {
            const fraction = (label.index + 0.5) / count;
            return (
              <span
                key={label.index}
                className="absolute whitespace-nowrap"
                style={{ left: `${fraction * 100}%`, transform: edgeShift(fraction) }}
              >
                {label.label}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-4 pl-[52px] text-[11px] text-[var(--text-muted)]">
        {count === 1 ? (
          <span>Single day — pick a longer range for trends</span>
        ) : (
          <>
            {weekends && (
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: SHADE }} />
                weekend
              </span>
            )}
            {trends && (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 border-t border-dashed border-[var(--text-secondary)]" />
                average {formatTokenCount(average)} / {grain}
              </span>
            )}
            {lastPartial && (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-[2px]"
                  style={{ background: hatch("var(--text-muted)") }}
                />
                so far
              </span>
            )}
            <span className="ml-auto">
              {pinned
                ? "Shift-click to stretch · Esc to clear"
                : "Click a bar to focus the page on it"}
            </span>
          </>
        )}
      </div>
    </>
  );
}
