import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyUsage } from "../../types";
import { formatPercent, formatTokenCount, shortUsageDate } from "../../agentUsageFormat";
import { providerMeta } from "./statsDerive";
import {
  type ChartMode,
  type ProviderFilter,
  nearestIndex,
  niceMax,
  niceTicks,
  stackSegments,
  visibleDaily,
} from "./chartScale";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const PLOT = 150;
const PROVIDER_KEYS = ["claude", "codex"] as const;

interface TokenActivityChartProps {
  daily: DailyUsage[];
}

export function TokenActivityChart({ daily }: TokenActivityChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [filter, setFilter] = useState<ProviderFilter>({ claude: true, codex: true });
  const [mode, setMode] = useState<ChartMode>("volume");
  const [cursor, setCursor] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(reducedMotion);
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) {
      setDrawn(true);
      return;
    }
    setDrawn(false);
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  const visible = useMemo(() => visibleDaily(daily, filter), [daily, filter]);
  const days = visible.days;
  const count = days.length;
  const maxValue = useMemo(() => niceMax(visible.max), [visible.max]);
  const ticks = useMemo(() => niceTicks(maxValue, mode), [maxValue, mode]);
  const single = count === 1;
  const barWidth = single ? 48 : count <= 7 ? 32 : count <= 14 ? 22 : 14;

  const toggleProvider = (key: "claude" | "codex") => {
    setFilter((current) => {
      const next = { ...current, [key]: !current[key] };
      if (!next.claude && !next.codex) return current;
      return next;
    });
  };

  const onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const element = plotRef.current;
    if (!element || count === 0) return;
    const rect = element.getBoundingClientRect();
    setCursor(nearestIndex(event.clientX, rect.left, rect.width, count));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setCursor((current) => Math.min(count - 1, (current ?? -1) + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setCursor((current) => Math.max(0, (current ?? count) - 1));
    } else if (event.key === "Escape") {
      setCursor(null);
    }
  };

  const activeDay = cursor !== null ? days[cursor] : null;
  const centerFraction = cursor !== null ? (cursor + 0.5) / count : 0;
  const flipTooltip = centerFraction > 0.62;

  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <style>{
        "@keyframes statsTooltipIn{from{opacity:0;transform:translateY(4px)}to{opacity:1}}"
      }</style>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium">Token activity</h2>
          <div className="flex items-center gap-2">
            {PROVIDER_KEYS.map((key) => {
              const meta = providerMeta(key);
              const on = filter[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleProvider(key)}
                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
                    on
                      ? "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] line-through hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: meta.color, opacity: on ? 1 : 0.4 }}
                  />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5">
          {(["volume", "share"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
                mode === option
                  ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative w-11 shrink-0" style={{ height: PLOT }}>
          {ticks.map((tick) => (
            <span
              key={tick.frac}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-[var(--text-muted)]"
              style={{ top: (1 - tick.frac) * PLOT }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div
          ref={plotRef}
          tabIndex={0}
          role="img"
          aria-label="Daily token usage by provider"
          onMouseMove={onMouseMove}
          onMouseLeave={() => setCursor(null)}
          onKeyDown={onKeyDown}
          className="relative flex-1 rounded-md outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]/50"
          style={{ height: PLOT }}
        >
          {ticks.map((tick) => (
            <div
              key={tick.frac}
              className={`absolute inset-x-0 border-t ${
                tick.frac === 0 ? "border-[var(--border)]" : "border-[var(--border)]/50"
              }`}
              style={{ top: (1 - tick.frac) * PLOT }}
            />
          ))}

          {cursor !== null && (
            <div
              className="absolute top-0 bg-[var(--bg-hover)]"
              style={{
                left: `${(cursor / count) * 100}%`,
                width: `${100 / count}%`,
                height: PLOT,
              }}
            />
          )}

          <div className="absolute inset-0 flex items-end">
            {days.map((day, index) => {
              const seg = stackSegments(day, mode, maxValue);
              const claudePx = seg.claude <= 0 ? 0 : Math.max(2, seg.claude * PLOT);
              const codexPx = seg.codex <= 0 ? 0 : Math.max(2, seg.codex * PLOT);
              const empty = claudePx === 0 && codexPx === 0;
              const dimmed = cursor !== null && cursor !== index;
              return (
                <div
                  key={day.date}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end px-[2px]"
                >
                  <div
                    className="mx-auto flex w-full flex-col justify-end"
                    style={{
                      maxWidth: barWidth,
                      opacity: dimmed ? 0.55 : 1,
                      transform: drawn ? "scaleY(1)" : "scaleY(0)",
                      transformOrigin: "bottom",
                      transition: reducedMotion
                        ? "none"
                        : `transform 240ms ease-out ${index * 8}ms, opacity 120ms ease-out`,
                    }}
                  >
                    {empty ? (
                      <div className="h-px w-full bg-[var(--border)]" />
                    ) : (
                      <>
                        {codexPx > 0 && (
                          <div
                            className="w-full rounded-t-[2px]"
                            style={{
                              height: codexPx,
                              backgroundColor: providerMeta("codex").color,
                              transition: reducedMotion ? "none" : "height 240ms ease-out",
                            }}
                          />
                        )}
                        {codexPx > 0 && claudePx > 0 && <div style={{ height: 2 }} />}
                        {claudePx > 0 && (
                          <div
                            className={`w-full ${codexPx > 0 ? "" : "rounded-t-[2px]"}`}
                            style={{
                              height: claudePx,
                              backgroundColor: providerMeta("claude").color,
                              transition: reducedMotion ? "none" : "height 240ms ease-out",
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

          {cursor !== null && (
            <div
              className="absolute top-0 w-px bg-[var(--text-muted)]"
              style={{ left: `${centerFraction * 100}%`, height: PLOT }}
            />
          )}

          {activeDay && (
            <div
              className="pointer-events-none absolute top-2 z-10"
              style={{
                left: `${centerFraction * 100}%`,
                transform: flipTooltip ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
              }}
            >
              <div
                className="w-max rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 shadow-lg"
                style={{ animation: reducedMotion ? "none" : "statsTooltipIn 120ms ease-out" }}
              >
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                {shortUsageDate(activeDay.date)}
              </div>
              <div className="mt-1.5 space-y-1">
                {PROVIDER_KEYS.filter((key) => filter[key]).map((key) => {
                  const meta = providerMeta(key);
                  const tokens = key === "claude" ? activeDay.claudeTokens : activeDay.codexTokens;
                  const share = tokens / Math.max(1, activeDay.totalTokens);
                  return (
                    <div key={key} className="flex items-center gap-2 text-[11px]">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="text-[var(--text-secondary)]">{meta.short}</span>
                      <span className="ml-auto tabular-nums text-[var(--text-primary)]">
                        {formatTokenCount(tokens)}
                      </span>
                      <span className="w-9 text-right tabular-nums text-[var(--text-muted)]">
                        {formatPercent(share)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex items-center gap-2 border-t border-[var(--border)] pt-1.5 text-[11px]">
                <span className="text-[var(--text-muted)]">Total</span>
                <span className="ml-auto tabular-nums text-[var(--text-primary)]">
                  {formatTokenCount(activeDay.totalTokens)}
                </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex gap-2">
        <div className="w-11 shrink-0" />
        <div className="relative h-4 flex-1 text-[10px] text-[var(--text-muted)]">
          {count === 0 ? null : single ? (
            <span className="absolute left-1/2 -translate-x-1/2">{shortUsageDate(days[0].date)}</span>
          ) : (
            <>
              <span className="absolute left-0">{shortUsageDate(days[0].date)}</span>
              <span className="absolute left-1/2 -translate-x-1/2">
                {shortUsageDate(days[Math.floor((count - 1) / 2)].date)}
              </span>
              <span className="absolute right-0">{shortUsageDate(days[count - 1].date)}</span>
            </>
          )}
        </div>
      </div>

      {single && (
        <div className="mt-2 text-[11px] text-[var(--text-muted)]">
          Single day — pick a longer range for trends
        </div>
      )}
    </div>
  );
}
