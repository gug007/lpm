import { useMemo, useState } from "react";
import type { DailyUsage } from "../../types";
import { providerMeta } from "./statsDerive";
import { type ChartMode, type ProviderFilter, visibleDaily } from "./chartScale";
import { type Grain, bucketDays, defaultGrain, grainChoices } from "./chartBuckets";
import type { DayRange } from "./statsScope";
import { ChartBars } from "./ChartBars";
import { ActivityCalendar } from "./ActivityCalendar";
import { ChartSegments } from "./ChartSegments";

const PROVIDER_KEYS = ["claude", "codex"] as const;

const VIEWS = [
  { value: "bars", label: "Bars" },
  { value: "calendar", label: "Calendar" },
] as const;

const GRAINS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

const MODES = [
  { value: "volume", label: "Volume" },
  { value: "share", label: "Share" },
] as const;

// Under four weeks a calendar is a sliver of squares.
const CALENDAR_MIN_DAYS = 28;

interface TokenActivityChartProps {
  /** Every day of the period up to today, the ones without usage as zeros. */
  daily: DailyUsage[];
  pinned: DayRange | null;
  onPin: (range: DayRange, extend: boolean) => void;
}

export function TokenActivityChart({ daily, pinned, onPin }: TokenActivityChartProps) {
  const [filter, setFilter] = useState<ProviderFilter>({ claude: true, codex: true });
  const [mode, setMode] = useState<ChartMode>("volume");
  const [grain, setGrain] = useState<Grain | null>(null);
  const [view, setView] = useState<"bars" | "calendar">("bars");

  const visible = useMemo(() => visibleDaily(daily, filter).days, [daily, filter]);
  const grains = grainChoices(daily.length);
  const activeGrain = grain && grains.includes(grain) ? grain : defaultGrain(daily.length);
  const buckets = useMemo(() => bucketDays(visible, activeGrain), [visible, activeGrain]);
  const calendarOffered = daily.length >= CALENDAR_MIN_DAYS;
  const calendar = calendarOffered && view === "calendar";

  const toggleProvider = (key: "claude" | "codex") => {
    setFilter((current) => {
      const next = { ...current, [key]: !current[key] };
      if (!next.claude && !next.codex) return current;
      return next;
    });
  };

  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <style>
        {"@keyframes statsTooltipIn{from{opacity:0;transform:translateY(4px)}to{opacity:1}}"}
      </style>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Token activity</h2>
          <div className="flex items-center gap-2">
            {PROVIDER_KEYS.map((key) => {
              const meta = providerMeta(key);
              const on = filter[key];
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
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
        <div className="flex items-center divide-x divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/60 py-0.5">
          {calendarOffered && (
            <ChartSegments label="Chart view" options={VIEWS} value={view} onChange={setView} />
          )}
          {!calendar && grains.length > 1 && (
            <ChartSegments
              label="Group by"
              options={GRAINS}
              value={activeGrain}
              onChange={setGrain}
            />
          )}
          {!calendar && (
            <ChartSegments label="Show as" options={MODES} value={mode} onChange={setMode} />
          )}
        </div>
      </div>

      {calendar ? (
        <ActivityCalendar days={visible} pinned={pinned} onPin={onPin} />
      ) : (
        <ChartBars
          buckets={buckets}
          grain={activeGrain}
          mode={mode}
          filter={filter}
          pinned={pinned}
          onPin={onPin}
        />
      )}
    </div>
  );
}
